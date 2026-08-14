const BASE = "http://localhost:3000";
let cookie = "";

const j = (r) => r.json().catch(() => ({}));

async function call(path, { method = "GET", body, expect = 200 } = {}) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const data = await j(res);
  const ok = res.status === expect;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${method} ${path} -> ${res.status}`,
    ok ? brief(data) : JSON.stringify(data),
  );
  return data;
}

function brief(o) {
  const s = JSON.stringify(o);
  return s.length > 200 ? s.slice(0, 200) + "…" : s;
}

async function main() {
  const EMAIL = "mira.creator@example.com";

  await call("/", { expect: 307 });
  await call("/api/auth/login", { method: "POST", body: { email: "demo@clipreach.app", password: "Password123!" } });
  await call("/api/auth/login", { method: "POST", body: { email: "demo@clipreach.app", password: "nope" }, expect: 401 });

  // create a lead WITH an email
  const created = await call("/api/leads", {
    method: "POST",
    body: { name: "Mira Kim", companyOrChannel: "Mira Kim shows", email: EMAIL, youtubeUrl: "https://youtube.com/@mira", niche: "Podcast", followersCount: 25000 },
  });
  const leadId = created.lead && created.lead.id;
  console.log("  -> created lead:", created.lead && created.lead.name, "score", created.lead && created.lead.leadScore);

  // analyze
  const analyzed = await call("/api/ai/analyze", { method: "POST", body: { leadId } });
  console.log("  -> score:", analyzed.result && analyzed.result.score, "/ breakdown factors:", analyzed.result && analyzed.result.breakdown?.length);

  // generate + send-without-approval (must be blocked)
  const gen = await call("/api/emails/generate", { method: "POST", body: { leadId } });
  const emailId = gen.email && gen.email.id;
  await call("/api/emails/send", { method: "POST", body: { emailId }, expect: 400 });

  // approve then send -> success
  await call("/api/emails/approve", { method: "POST", body: { emailId, subject: gen.email.subject, body: gen.email.body } });
  await call("/api/emails/send", { method: "POST", body: { emailId } });

  const prof = await call("/api/leads/" + leadId);
  console.log("  -> status:", prof.lead.status, "| followUps:", prof.followUps.length, "pending:", prof.followUps.filter((f) => f.status === "Pending").length, "| email status:", prof.emails[0]?.status);

  // reply Interested -> follow-ups auto-cancelled
  await call("/api/replies", { method: "POST", body: { leadId, classification: "Interested", contentSnippet: "Let's do it" }, expect: 201 });
  const prof2 = await call("/api/leads/" + leadId);
  console.log("  -> after reply:", prof2.lead.status, "| followUp statuses:", prof2.followUps.map((f) => f.status).join(","));

  // suppression guard: block, then regenerate/approve/send -> must be blocked
  await call("/api/suppressions", { method: "POST", body: { email: EMAIL, reason: "ManualBlock" }, expect: 201 });
  const gen2 = await call("/api/emails/generate", { method: "POST", body: { leadId } });
  await call("/api/emails/approve", { method: "POST", body: { emailId: gen2.email.id, subject: gen2.email.subject, body: gen2.email.body } });
  await call("/api/emails/send", { method: "POST", body: { emailId: gen2.email.id }, expect: 400 });

  // lead status is Client/Unsubscribed → resend blocked even without suppression entry
  const prof3 = await call("/api/leads/" + leadId);
  console.log("  -> final status:", prof3.lead.status);

  const dash = await call("/api/dashboard");
  console.log("  -> dashboard:", brief(dash.counters));
  const fu = await call("/api/follow-ups");
  console.log("  -> follow-up pending:", fu.groups && fu.groups.pendingCount);
}

main().then(() => console.log("SMOKE DONE")).catch((e) => { console.error("SMOKE ERROR", e); process.exit(1); });