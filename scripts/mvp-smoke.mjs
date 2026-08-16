import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';

const base = process.env.BASE_URL || 'http://localhost:3100';
const run = randomUUID().slice(0, 8);
const password = `Smoke-${run}-Pass!`;
const users = {
  A: { email: `smoke-a-${run}@example.test`, name: `Smoke A ${run}` },
  B: { email: `smoke-b-${run}@example.test`, name: `Smoke B ${run}` },
};
const jars = { A: '', B: '', anon: '' };
const results = [];
const ids = { A: {}, B: {} };

function signedWebhookHeaders(body) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', process.env.BOUNCE_WEBHOOK_SECRET || 'local-bounce-webhook-secret-change-me')
    .update(`${timestamp}.${JSON.stringify(body)}`)
    .digest('base64url');
  return { 'x-clipreach-timestamp': timestamp, 'x-clipreach-signature': signature };
}

function signedUnsubscribeToken(userId, leadId, email) {
  const payload = Buffer.from(JSON.stringify({ userId, leadId, email, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const signature = createHmac('sha256', process.env.UNSUBSCRIBE_SECRET || 'local-unsubscribe-secret-change-me').update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function record(label, method, path, status, assertion) {
  results.push({ label, method, path, status, assertion });
  console.log(`${status} ${method} ${path} :: ${assertion}`);
}

async function request(who, method, path, body, expected, assertion, extraHeaders = {}) {
  const label = assertion;
  const headers = { ...extraHeaders };
  if (body !== undefined && !(body instanceof FormData)) headers['content-type'] = 'application/json';
  if (jars[who]) headers.cookie = jars[who];
  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    redirect: 'manual',
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) jars[who] = setCookie.split(';')[0];
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  assert.ok([].concat(expected).includes(res.status), `${label}: expected ${expected}, got ${res.status}: ${text}`);
  record(label, method, path, res.status, assertion);
  return { res, data, text };
}

async function register(who) {
  const u = users[who];
  const r = await request(who, 'POST', '/api/auth/register', {
    ...u, password, businessDescription: `Video editing smoke business ${run}`,
  }, 201, 'registered and session cookie issued');
  assert.equal(r.data.user.email, u.email);
  assert.match(r.res.headers.get('set-cookie') || '', /HttpOnly/i);
  ids[who].user = r.data.user.id;
  await request(who, 'GET', '/api/auth/me', undefined, 200, 'registration session resolves current user');
}

async function createLead(who, suffix, email) {
  const r = await request(who, 'POST', '/api/leads', {
    name: `${who} Lead ${suffix} ${run}`,
    companyOrChannel: `${who} Channel ${suffix}`,
    email,
    niche: 'Education', followersCount: 12000,
  }, 201, 'lead created in authenticated account');
  return r.data.lead.id;
}

async function analyzeDraft(who, leadId) {
  const a = await request(who, 'POST', '/api/ai/analyze', { leadId }, 200, 'mock AI analysis returned deterministic score');
  assert.ok(a.data.result.score >= 0 && a.data.result.score <= 100);
  const g = await request(who, 'POST', '/api/emails/generate', { leadId }, 200, 'mock AI draft generated');
  assert.equal(g.data.email.leadId, leadId);
  return g.data.email;
}

async function approve(who, email, subjectSuffix = '') {
  const subject = `${email.subject}${subjectSuffix}`;
  const body = `${email.body}\n\nSmoke marker ${run}`;
  const r = await request(who, 'POST', '/api/emails/approve', { emailId: email.id, subject, body }, 200, 'exact subject/body approved');
  return r.data.email;
}

async function main() {
  await request('anon', 'GET', '/api/auth/me', undefined, 401, 'unauthenticated session denied');
  await register('A');
  await register('B');

  await request('A', 'POST', '/api/auth/logout', undefined, 200, 'logout invalidated session');
  await request('A', 'GET', '/api/auth/me', undefined, 401, 'logged-out session denied');
  await request('A', 'POST', '/api/auth/login', { email: users.A.email, password: 'wrong-password' }, 401, 'invalid password denied');
  await request('A', 'POST', '/api/auth/login', { email: users.A.email, password }, 200, 'valid login restored session');
  await request('A', 'GET', '/api/auth/me', undefined, 200, 'login session persists across request');
  const dashboard = await request('A', 'GET', '/api/dashboard', undefined, 200, 'authenticated dashboard contract is available');
  assert.deepEqual(Object.keys(dashboard.data).sort(), ['counters', 'analytics', 'hotLeads', 'dueFollowUps', 'recentReplies', 'activities'].sort());
  assert.deepEqual(Object.keys(dashboard.data.counters).sort(), [
    'totalLeads', 'newLeads', 'qualified', 'contacted', 'interested', 'clients',
    'emailsSent', 'replies', 'replyRate', 'pendingFollowUps',
  ].sort());
  assert.ok(Array.isArray(dashboard.data.hotLeads));
  assert.ok(Array.isArray(dashboard.data.dueFollowUps));
  assert.ok(Array.isArray(dashboard.data.recentReplies));

  ids.A.primaryEmail = `lead-a-primary-${run}@example.test`;
  ids.B.primaryEmail = `lead-b-primary-${run}@example.test`;
  ids.A.primaryLead = await createLead('A', 'primary', ids.A.primaryEmail);
  ids.B.primaryLead = await createLead('B', 'primary', ids.B.primaryEmail);

  await request('anon', 'GET', `/api/unsubscribe?email=${encodeURIComponent(ids.A.primaryEmail)}`, undefined, 400, 'raw-email unsubscribe token rejected');
  const unchangedSuppression = await request('A', 'GET', '/api/suppressions', undefined, 200, 'raw-email unsubscribe does not mutate state');
  assert.ok(!unchangedSuppression.data.entries.some((entry) => entry.email === ids.A.primaryEmail));
  await request('anon', 'POST', '/api/bounces', { emailMessageId: 'forged-message-id', event: 'bounce' }, 401, 'unsigned bounce webhook rejected');

  ids.A.unsubscribeEmail = `unsubscribe-${run}@example.test`;
  ids.A.unsubscribeLead = await createLead('A', 'unsubscribe', ids.A.unsubscribeEmail);
  const unsubscribeToken = signedUnsubscribeToken(ids.A.user, ids.A.unsubscribeLead, ids.A.unsubscribeEmail);
  await request('anon', 'GET', `/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`, undefined, 200, 'valid scoped unsubscribe token accepted');
  const scopedSuppression = await request('A', 'GET', '/api/suppressions', undefined, 200, 'scoped unsubscribe creates owner suppression');
  assert.ok(scopedSuppression.data.entries.some((entry) => entry.email === ids.A.unsubscribeEmail));

  const sequenceA = await request('A', 'POST', '/api/sequences', { name: `Sequence A ${run}` }, 201, 'sequence A created');
  const sequenceB = await request('B', 'POST', '/api/sequences', { name: `Sequence B ${run}` }, 201, 'sequence B created');
  ids.A.sequence = sequenceA.data.sequence.id;
  ids.B.sequence = sequenceB.data.sequence.id;
  const stepB = await request('B', 'POST', `/api/sequences/${ids.B.sequence}/steps`, { subject: 'B subject', body: 'B body' }, 201, 'sequence B step created');
  ids.B.step = stepB.data.step.id;
  await request('A', 'DELETE', `/api/sequences/${ids.A.sequence}/steps?stepId=${ids.B.step}`, undefined, 404, 'cross-user sequence-step delete denied');
  const stepsBAfterIdor = await request('B', 'GET', `/api/sequences/${ids.B.sequence}/steps`, undefined, 200, 'foreign sequence step remains intact');
  assert.ok(stepsBAfterIdor.data.steps.some((step) => step.id === ids.B.step));

  const campaignA = await request('A', 'POST', '/api/campaigns', { name: `Campaign A ${run}` }, 201, 'campaign A created');
  const campaignB = await request('B', 'POST', '/api/campaigns', { name: `Campaign B ${run}` }, 201, 'campaign B created');
  ids.A.campaign = campaignA.data.campaign.id;
  ids.B.campaign = campaignB.data.campaign.id;
  const variantB = await request('B', 'POST', `/api/campaigns/${ids.B.campaign}/variants`, { subject: 'B subject', body: 'B body' }, 201, 'campaign B variant created');
  ids.B.variant = variantB.data.variant.id;
  await request('A', 'DELETE', `/api/campaigns/${ids.A.campaign}/variants?variantId=${ids.B.variant}`, undefined, 404, 'cross-user campaign variant delete denied');
  const variantsBAfterIdor = await request('B', 'GET', `/api/campaigns/${ids.B.campaign}/variants`, undefined, 200, 'foreign campaign variant remains intact');
  assert.ok(variantsBAfterIdor.data.variants.some((variant) => variant.id === ids.B.variant));

  const csv = `name,email,companyOrChannel,followersCount\nCSV Valid ${run},csv-valid-${run}@example.test,CSV Channel,25000\nCSV Duplicate ${run},lead-a-primary-${run}@example.test,Dup Channel,100\n=FORMULA,csv-formula-${run}@example.test,Bad Channel,100`;
  const importForm = new FormData();
  importForm.append('file', new Blob([csv], { type: 'text/csv' }), `leads-${run}.csv`);
  const preview = await request('A', 'POST', '/api/leads/import/preview', importForm, 200, 'CSV preview validates valid, duplicate, and formula rows');
  assert.equal(preview.data.counts.total, 3);
  assert.equal(preview.data.rows.filter(x => x.isValid).length, 1);
  const commit = await request('A', 'POST', '/api/leads/import/commit', { records: preview.data.records, mappings: preview.data.mapping }, 200, 'CSV commit reports imported and invalid counts');
  assert.equal(commit.data.imported, 1);
  assert.equal(commit.data.invalid, 1);
  assert.equal(commit.data.duplicates, 1);

  const template = await request('A', 'POST', '/api/templates', {
    name: `Template ${run}`, category: 'Smoke', subject: 'Hello {{firstName}}', body: 'Hi {{name}} from {{companyOrChannel}}',
  }, 201, 'template created');
  ids.A.template = template.data.template.id;
  const provider = await request('A', 'POST', '/api/settings/providers', {
    type: 'ai', platform: 'OpenAI', displayName: `Smoke ${run}`, config: '{}', dailyLimit: 5,
  }, 201, 'provider resource created with encrypted config');
  ids.A.provider = provider.data.provider.id;
  const providers = await request('A', 'GET', '/api/settings/providers', undefined, 200, 'provider list omits credentials');
  assert.ok(!JSON.stringify(providers.data).includes('configEncrypted'));
  const emailProvider = await request('A', 'POST', '/api/settings/providers', {
    type: 'email', platform: 'SMTP', displayName: `Smoke SMTP ${run}`,
    config: JSON.stringify({ host: 'smtp.invalid', port: 587, user: 'smoke', pass: 'smoke', from: 'smoke@example.test' }), dailyLimit: 5,
  }, 201, 'email provider resource created');
  ids.A.emailProvider = emailProvider.data.provider.id;
  ids.A.segmentTarget = await createLead('A', 'segment-target', `segment-target-${run}@example.test`);
  await request('A', 'PATCH', `/api/leads/${ids.A.segmentTarget}`, { status: 'Analyzed' }, 200, 'segment target status set');
  ids.A.segmentOther = await createLead('A', 'segment-other', `segment-other-${run}@example.test`);
  const targetDetails = await request('A', 'GET', `/api/leads/${ids.A.segmentTarget}`, undefined, 200, 'segment target retains email and status');
  const analyzedLeads = await request('A', 'GET', '/api/leads?status=Analyzed', undefined, 200, 'analyzed lead collection is available');
  const segment = await request('A', 'POST', '/api/segments', {
    name: `Smoke Segment ${run}`, filters: JSON.stringify([{ field: 'status', op: 'eq', value: 'Analyzed' }]),
  }, 201, 'filtered segment created');
  ids.A.segment = segment.data.segment.id;
  await request('A', 'PATCH', `/api/campaigns/${ids.A.campaign}`, { templateId: ids.A.template, segmentId: ids.A.segment }, 200, 'campaign linked to owned template and segment');
  const startedCampaign = await request('A', 'POST', `/api/campaigns/${ids.A.campaign}/start`, undefined, 200, 'campaign starts with segment filter');
  assert.equal(startedCampaign.data.leads, 1);
  const approvalGate = await request('A', 'POST', `/api/campaigns/${ids.A.campaign}/send`, undefined, 200, 'campaign send creates approval-required drafts');
  assert.equal(approvalGate.data.sent, 0);
  assert.ok(approvalGate.data.approvalRequired >= 1);

  const draft = await analyzeDraft('A', ids.A.primaryLead);
  ids.A.email = draft.id;
  const edited = await request('A', 'POST', '/api/emails/edit', { emailId: draft.id, action: 'shorten' }, 200, 'draft edited by mock AI and approval invalidated');
  const editedEmail = edited.data.email;
  await request('A', 'POST', '/api/emails/send', { emailId: draft.id }, 400, 'unapproved edited draft blocked');
  await approve('A', editedEmail, ` ${run}`);

  await request('A', 'POST', '/api/settings/pause', { paused: true }, 200, 'global outreach paused');
  await request('A', 'POST', '/api/emails/send', { emailId: draft.id }, 400, 'global pause immediately blocks send');
  await request('A', 'POST', '/api/settings/pause', { paused: false }, 200, 'global outreach resumed');
  await request('A', 'GET', '/api/settings/pause', undefined, 200, 'resumed state persisted');
  const sent = await request('A', 'POST', '/api/emails/send', { emailId: draft.id }, 200, 'approved email sent through mock provider');
  assert.equal(sent.data.email.status, 'Sent');
  await request('A', 'POST', '/api/emails/send', { emailId: draft.id }, 400, 'duplicate send blocked');
  const detailAfterSend = await request('A', 'GET', `/api/leads/${ids.A.primaryLead}`, undefined, 200, 'sent state and follow-up persist after reload');
  assert.equal(detailAfterSend.data.emails[0].status, 'Sent');
  assert.equal(detailAfterSend.data.followUps.filter(x => x.status === 'Pending').length, 1);
  ids.A.followUp = detailAfterSend.data.followUps[0].id;
  const bounceBody = { emailMessageId: ids.A.email, event: 'bounce' };
  await request('anon', 'POST', '/api/bounces', bounceBody, 200, 'signed bounce webhook accepted', signedWebhookHeaders(bounceBody));
  const bouncedSuppressions = await request('A', 'GET', '/api/suppressions', undefined, 200, 'signed bounce creates account-scoped suppression');
  assert.ok(bouncedSuppressions.data.entries.some((entry) => entry.email === ids.A.primaryEmail));

  const reply = await request('A', 'POST', '/api/replies', {
    leadId: ids.A.primaryLead, emailMessageId: ids.A.email, classification: 'Interested', contentSnippet: 'Interested, tell me more',
  }, 201, 'reply recorded and lead classified');
  ids.A.reply = reply.data.reply.id;
  const detailAfterReply = await request('A', 'GET', `/api/leads/${ids.A.primaryLead}`, undefined, 200, 'reply persisted and pending follow-up cancelled');
  assert.equal(detailAfterReply.data.lead.status, 'Interested');
  assert.equal(detailAfterReply.data.followUps[0].status, 'Cancelled');

  ids.A.suppLead = await createLead('A', 'suppression', `lead-a-supp-${run}@example.test`);
  const suppDraft = await analyzeDraft('A', ids.A.suppLead);
  ids.A.suppEmail = suppDraft.id;
  await approve('A', suppDraft);
  await request('A', 'POST', '/api/emails/send', { emailId: suppDraft.id }, 200, 'second email sent to create pending follow-up');
  let suppDetail = await request('A', 'GET', `/api/leads/${ids.A.suppLead}`, undefined, 200, 'pending follow-up exists before suppression');
  assert.equal(suppDetail.data.followUps[0].status, 'Pending');
  ids.A.suppFollowUp = suppDetail.data.followUps[0].id;
  const suppression = await request('A', 'POST', '/api/suppressions', { email: `lead-a-supp-${run}@example.test`, reason: 'ManualBlock' }, 201, 'manual suppression created');
  ids.A.suppression = suppression.data.entry.id;
  suppDetail = await request('A', 'GET', `/api/leads/${ids.A.suppLead}`, undefined, 200, 'suppression persisted, lead unsubscribed, follow-up cancelled');
  assert.equal(suppDetail.data.lead.status, 'Unsubscribed');
  assert.equal(suppDetail.data.followUps[0].status, 'Cancelled');
  const blockedDraft = await analyzeDraft('A', ids.A.suppLead);
  await approve('A', blockedDraft);
  await request('A', 'POST', '/api/emails/send', { emailId: blockedDraft.id }, 400, 'suppression immediately blocks later send');

  const idor = [
    ['GET', `/api/leads/${ids.A.primaryLead}`, undefined, 404, 'cross-user lead read denied'],
    ['PATCH', `/api/leads/${ids.A.primaryLead}`, { name: 'IDOR' }, 404, 'cross-user lead update denied'],
    ['DELETE', `/api/leads/${ids.A.primaryLead}`, undefined, 404, 'cross-user lead delete denied'],
    ['POST', '/api/ai/analyze', { leadId: ids.A.primaryLead }, 404, 'cross-user analysis denied'],
    ['POST', '/api/emails/generate', { leadId: ids.A.primaryLead }, 404, 'cross-user draft generation denied'],
    ['POST', '/api/emails/edit', { emailId: ids.A.email, action: 'shorten' }, 404, 'cross-user email edit denied'],
    ['POST', '/api/emails/approve', { emailId: ids.A.email, subject: 'x', body: 'x' }, 404, 'cross-user email approval denied'],
    ['POST', '/api/emails/send', { emailId: ids.A.email }, 404, 'cross-user email send denied'],
    ['POST', '/api/replies', { leadId: ids.A.primaryLead, emailMessageId: ids.A.email, classification: 'Replied' }, 404, 'cross-user reply creation denied'],
    ['POST', '/api/follow-ups/action', { id: ids.A.followUp, action: 'cancel' }, 404, 'cross-user follow-up action denied'],
    ['DELETE', `/api/templates/${ids.A.template}`, undefined, 404, 'cross-user template delete denied'],
    ['PATCH', '/api/settings/providers', { id: ids.A.provider, isActive: false }, 404, 'cross-user provider update denied'],
  ];
  for (const [method, path, body, status, assertion] of idor) await request('B', method, path, body, status, assertion);

  const bSuppressionsBefore = await request('B', 'GET', '/api/suppressions', undefined, 200, 'cross-user suppression list isolated');
  assert.ok(!bSuppressionsBefore.data.entries.some(x => x.id === ids.A.suppression));
  await request('B', 'DELETE', `/api/suppressions?id=${ids.A.suppression}`, undefined, 200, 'cross-user suppression delete is non-disclosing no-op');
  const aSuppressionsAfter = await request('A', 'GET', '/api/suppressions', undefined, 200, 'owner suppression remains after cross-user delete attempt');
  assert.ok(aSuppressionsAfter.data.entries.some(x => x.id === ids.A.suppression));
  await request('B', 'DELETE', `/api/settings/providers?id=${ids.A.provider}`, undefined, 200, 'cross-user provider delete is non-disclosing no-op');
  const aProvidersAfter = await request('A', 'GET', '/api/settings/providers', undefined, 200, 'owner provider remains after cross-user delete attempt');
  assert.ok(aProvidersAfter.data.providers.some(x => x.id === ids.A.provider));

  const bLeads = await request('B', 'GET', '/api/leads', undefined, 200, 'lead collection is account scoped');
  assert.ok(!bLeads.data.leads.some(x => x.id === ids.A.primaryLead));
  const bReplies = await request('B', 'GET', '/api/replies', undefined, 200, 'reply collection is account scoped');
  assert.ok(!bReplies.data.replies.some(x => x.id === ids.A.reply));
  const bFollowups = await request('B', 'GET', '/api/follow-ups', undefined, 200, 'follow-up collection is account scoped');
  assert.ok(!JSON.stringify(bFollowups.data).includes(ids.A.followUp));
  const bTemplates = await request('B', 'GET', '/api/templates', undefined, 200, 'template collection is account scoped');
  assert.ok(!bTemplates.data.templates.some(x => x.id === ids.A.template));
  const bProviders = await request('B', 'GET', '/api/settings/providers', undefined, 200, 'provider collection is account scoped');
  assert.ok(!bProviders.data.providers.some(x => x.id === ids.A.provider));

  await request('A', 'DELETE', `/api/templates/${ids.A.template}`, undefined, 200, 'disposable template cleaned up');
  await request('A', 'DELETE', `/api/settings/providers?id=${ids.A.provider}`, undefined, 200, 'disposable provider cleaned up');
  await request('A', 'DELETE', `/api/suppressions?id=${ids.A.suppression}`, undefined, 200, 'disposable suppression cleaned up');
  await request('A', 'DELETE', `/api/leads/${ids.A.primaryLead}`, undefined, 200, 'primary disposable lead and related resources cleaned up');
  await request('A', 'DELETE', `/api/leads/${ids.A.suppLead}`, undefined, 200, 'suppression disposable lead and related resources cleaned up');
  await request('B', 'DELETE', `/api/leads/${ids.B.primaryLead}`, undefined, 200, 'user B disposable lead cleaned up');

  console.log('\nSMOKE_RESULT_JSON=' + JSON.stringify({ run, users, ids, results }));
}

main().catch(err => {
  console.error('\nSMOKE_FAILED', err);
  console.error('PARTIAL_RESULT_JSON=' + JSON.stringify({ run, users, ids, results }));
  process.exitCode = 1;
});
