import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";
import { computeScore } from "../src/lib/leadScore";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@clipreach.app";
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword("Password123!"),
        name: "Demo User",
        businessDescription:
          "Short-form video editing — repurposing long YouTube videos into Shorts, Reels and TikToks for creators.",
      },
    });
    console.log("Created demo user:", email);
  } else {
    console.log("Demo user already exists.");
  }

  await seedTemplates(user.id);

  // sample leads (only if this user has none)
  const count = await prisma.lead.count({ where: { userId: user.id } });
  if (count === 0) {
    const samples = [
      { name: "Alex Rivera", companyOrChannel: "ALEX RIVERA", email: "alex@rivera.studio", niche: "Business / Podcast", youtubeUrl: "https://youtube.com/@alexrivera", followersCount: 84000, longFormCount: 12, shortFormCount: 0, contentActivity: 72, growthSignal: 60, commercialPotential: 80 },
      { name: "Mia Chen", companyOrChannel: "Mia Chen Show", email: "mia@miachens.com", niche: "Podcast", youtubeUrl: "https://youtube.com/@miachens", followersCount: 180_000, longFormCount: 40, shortFormCount: 2, contentActivity: 80, growthSignal: 70, commercialPotential: 60 },
      { name: "Sam Okafor", companyOrChannel: "Sam Okafor", email: "sam@okafor.media", niche: "Education", youtubeUrl: "https://youtube.com/@samokafor", followersCount: 5600, longFormCount: 8, shortFormCount: 0, contentActivity: 40, growthSignal: 30, commercialPotential: 50 },
    ];
    for (const s of samples) {
      const { score, breakdown } = computeScore({
        email: s.email,
        followersCount: s.followersCount,
        contentActivity: s.contentActivity,
        longFormCount: s.longFormCount,
        shortFormCount: s.shortFormCount,
        growthSignal: s.growthSignal,
        commercialPotential: s.commercialPotential,
      });
      const lead = await prisma.lead.create({
        data: {
          userId: user.id,
          name: s.name,
          companyOrChannel: s.companyOrChannel,
          email: s.email,
          youtubeUrl: s.youtubeUrl,
          niche: s.niche,
          followersCount: s.followersCount,
          contentActivity: s.contentActivity,
          longFormCount: s.longFormCount,
          shortFormCount: s.shortFormCount,
          growthSignal: s.growthSignal,
          commercialPotential: s.commercialPotential,
          leadScore: score,
          scoreBreakdown: JSON.stringify(breakdown),
          status: "Analyzed",
          insight: JSON.stringify({
            opportunity: `${s.companyOrChannel} publishes valuable long-form but lacks short clips, missing a big reach channel.`,
            pitchAngle: "Turn one long video into several Shorts to multiply reach with no extra filming.",
            suggestedOffer: "A low-risk 3-clip test package to validate the format.",
            suggestedTest: "One 30-60s Short cut from a best recent video.",
            risk: "Confirm openness to outsourced editing.",
          }),
        },
      });
      await prisma.activity.create({
        data: { userId: user.id, leadId: lead.id, type: "Analyzed", payload: JSON.stringify({ score }) },
      });
    }
    console.log("Seeded 3 sample leads.");
  }

  console.log("Seed complete. Login: demo@clipreach.app / Password123!");
}

async function seedTemplates(userId: string) {
  const count = await prisma.emailTemplate.count({ where: { userId } });
  if (count > 0) return;
  await prisma.emailTemplate.createMany({
    data: [
      {
        userId,
        name: "Cold Outreach (Creator)",
        category: "ColdOutreach",
        subject: "Idea for growing reach on Shorts",
        body:
          "Hi {{firstName}},\n\nI've been looking at {{companyOrChannel}} and noticed your long-form isn't reaching the Shorts/Reels audience yet.\n\nI help creators turn one long video into several short clips that pull new viewers back to the main channel. I'd love to cut a quick 30-second test from a recent video, free, so you can judge the result yourself.\n\nWant me to send it over?",
      },
      {
        userId,
        name: "Podcast Outreach",
        category: "PodcastOutreach",
        subject: "Short clips from your podcast",
        body:
          "Hi {{firstName}},\n\nYour podcast episode topics are perfect for short clips, but most of that content lives only in the full episode.\n\nI repurpose episodes into quotes and highlights for Reels/Shorts that bring new listeners back to the show. I can do a free test clip so you can see the style.\n\nWant to try it?",
      },
      {
        userId,
        name: "Follow-up 1",
        category: "FollowUp1",
        subject: "Re: Short clips idea",
        body:
          "Hi {{firstName}},\n\nJust bumping this to the top of your inbox in case you missed it. I'm happy to send a free test clip from your recent content if you'd like to see the style.\n\nNo pressure at all!",
      },
    ],
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());