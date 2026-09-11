import { config as loadEnv } from 'dotenv';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';

// Provisions the single admin account from ADMIN_EMAIL/ADMIN_INITIAL_PASSWORD (PROJECT_SPEC
// §5.3/FR-13: "Better Auth secure cookie sessions, single admin"). The app's own
// `auth` instance (src/modules/auth/auth.ts) has `disableSignUp: true` — sign-up is deliberately
// unreachable from any route. This script builds a throwaway instance with sign-up enabled,
// purely to call Better Auth's own password-hashing/account-creation path instead of
// hand-rolling one, then never touches it again. Idempotent: does nothing if the email already
// has an account.

loadEnv({ path: '.env.local' });
loadEnv();

// Imported dynamically, AFTER the env files are loaded — see prisma/seed-demo.ts for why a static
// top-level import would hoist above the loadEnv() calls and build the pg pool with an undefined
// connection string.
const { prisma } = await import('../src/modules/shared/lib/prisma');

// Real content. Each section is seeded once and then left alone — this script runs as a side effect
// of every `prisma migrate dev` (see `prisma.seed` in package.json) and must never clobber live
// edits.
//
// Since ADR-016 `profile` is the lab's singleton and the professor is the lab's DIRECTOR: a
// `team_member` row carrying her bio, links and photo, with her CV lines as `cv_entry` rows attached
// to it. (The seven Json list columns ADR-012 dropped are gone from this script too.)
const LAB_PROFILE = {
  labName: 'The Culprit of Privacy Technologies',
  positionAffiliation: 'Department of Computer Engineering, Chiang Mai University',
  researchStatement:
    "I am interested in research on information security, privacy for cloud-IoT platforms and privacy by design. My research focuses on designing an architecture to enhance the process of disclosing information about individuals while minimising the breach of users' privacy.",
};

const DIRECTOR = {
  name: 'Dr. Jenjira Jaimunk',
  citationName: 'J. Jaimunk',
  role: 'Assistant Professor',
  affiliation: 'Department of Computer Engineering, Chiang Mai University',
  bio: "I am currently an assistant professor in Computer Engineering at Chiang Mai University. I obtained my PhD in Computer Science from King's College London in 2021. During my PhD studies, I was a research fellow at the School of Informatics, University of Edinburgh, UK; a guest teacher at the London School of Economics and Political Science (with an Excellence in Education Award 2020-2021); and a teaching assistant at King's College London. I have been invited to be a visiting researcher in many prestigious universities in Europe and the UK, such as the University College London (2025), King's College London (2024 and 2025), and Nantes Université, which is funded by the European Union's Horizon 2020 research and innovation programme under the Marie Skłodowska-Curie grant (2026). I have won multiple awards, including the Erasmus Mundus Scholarship (a ten-month program in Italy in 2009, a one-month program in the UK in 2015 and a ten-day program in Portugal in 2022), and received student travel awards at the Symposium on Search-Based Software Engineering (SSBSE 2019), Estonia and the UK PhD Winter School on Cyber Security 2020, Newcastle, UK.",
  linkedinUrl: 'https://www.linkedin.com/in/jenjira-jaimunk-535b7734/',
  googleScholarUrl: 'https://scholar.google.com/citations?user=Evff3gsAAAAJ&hl=en',
  isDirector: true,
  sortOrder: -1,
};

type CvLine = { title: string; subtitle?: string; year?: string };

// Her CV, one list per `cv_entry.section`. Array order becomes `sortOrder` within the section.
const DIRECTOR_CV: Record<
  | 'education'
  | 'fellowship'
  | 'scholarship'
  | 'research_interest'
  | 'invited_talk'
  | 'teaching_role'
  | 'teaching_award',
  CvLine[]
> = {
  education: [{ title: 'PhD, Computer Science', subtitle: "King's College London", year: '2021' }],
  fellowship: [
    {
      title: 'Research Fellow',
      subtitle: 'School of Informatics, University of Edinburgh, UK',
      year: 'during PhD',
    },
    { title: 'Visiting Researcher', subtitle: 'University College London', year: '2025' },
    { title: 'Visiting Researcher', subtitle: "King's College London", year: '2024' },
    { title: 'Visiting Researcher', subtitle: "King's College London", year: '2025' },
    {
      title: 'Visiting Researcher',
      subtitle:
        "Nantes Université — funded by the EU's Horizon 2020 programme under a Marie Skłodowska-Curie grant",
      year: '2026',
    },
  ],
  teaching_role: [
    {
      title: 'Guest Teacher',
      subtitle: 'London School of Economics and Political Science',
      year: 'during PhD',
    },
    { title: 'Teaching Assistant', subtitle: "King's College London", year: 'during PhD' },
  ],
  teaching_award: [
    {
      title: 'Excellence in Education Award',
      subtitle: 'London School of Economics and Political Science',
      year: '2020–2021',
    },
  ],
  scholarship: [
    { title: 'Erasmus Mundus Scholarship', subtitle: 'Ten-month programme, Italy', year: '2009' },
    { title: 'Erasmus Mundus Scholarship', subtitle: 'One-month programme, UK', year: '2015' },
    { title: 'Erasmus Mundus Scholarship', subtitle: 'Ten-day programme, Portugal', year: '2022' },
    {
      title: 'Student Travel Award',
      subtitle: 'Symposium on Search-Based Software Engineering (SSBSE), Estonia',
      year: '2019',
    },
    {
      title: 'Student Travel Award',
      subtitle: 'UK PhD Winter School on Cyber Security, Newcastle, UK',
      year: '2020',
    },
  ],
  research_interest: [
    { title: 'Information security' },
    { title: 'Privacy for cloud-IoT platforms' },
    { title: 'Privacy by design' },
  ],
  invited_talk: [
    {
      title: 'Software Systems Engineering Reading Group Seminar',
      subtitle: 'University College London',
    },
    { title: 'Software System Group Seminar', subtitle: "King's College London" },
    { title: 'Systems Research Group Seminar', subtitle: 'University of Cambridge' },
    {
      title: 'Oxford Wom*n in Computer Science Society Seminar',
      subtitle: 'University of Oxford, UK',
    },
    {
      title: 'Center for Computer Science (CCS)',
      subtitle: 'Muroran Institute of Technology, Japan',
    },
  ],
};

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_INITIAL_PASSWORD;

  if (!email || !password) {
    console.log('ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD not set — skipping admin seed.');
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin account for ${email} already exists — skipping.`);
    return;
  }

  const seedAuth = betterAuth({
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    secret: process.env.BETTER_AUTH_SECRET,
    emailAndPassword: { enabled: true, disableSignUp: false },
  });

  await seedAuth.api.signUpEmail({
    body: { email, password, name: DIRECTOR.name },
  });

  console.log(`Admin account created for ${email}.`);
}

async function seedProfile() {
  const existing = await prisma.profile.findFirst();
  if (existing) {
    console.log('Lab profile already present — skipping.');
    return;
  }
  await prisma.profile.create({ data: LAB_PROFILE });
  console.log('Lab profile created.');
}

async function seedDirector() {
  const existing = await prisma.teamMember.findFirst({ where: { isDirector: true } });
  if (existing) {
    console.log('Director already present — skipping her profile and CV.');
    return;
  }
  await prisma.$transaction(async (tx) => {
    const director = await tx.teamMember.create({ data: DIRECTOR });
    const entries = Object.entries(DIRECTOR_CV).flatMap(([section, lines]) =>
      lines.map((line, sortOrder) => ({
        teamMemberId: director.id,
        section: section as keyof typeof DIRECTOR_CV,
        title: line.title,
        subtitle: line.subtitle ?? null,
        year: line.year ?? null,
        sortOrder,
      })),
    );
    await tx.cvEntry.createMany({ data: entries });
    console.log(`Director created with ${entries.length} CV entries.`);
  });
}

async function main() {
  await seedAdmin();
  await seedProfile();
  await seedDirector();
}

main()
  .catch((error) => {
    console.error('Admin seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
