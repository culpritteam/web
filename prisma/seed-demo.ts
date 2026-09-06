import { config as loadEnv } from 'dotenv';

// Fictional demo content for local development and manual QA — every person, venue and award
// below is invented. Separate from `seed.ts` (which provisions the real admin account and is what
// `prisma.seed` runs): this one is opt-in via `npm run db:seed:demo`, so it never fires as a side
// effect of `prisma migrate dev`.
//
// Additive and idempotent. Each section is skipped when its table already has rows, so re-running
// can't duplicate content, and nothing here deletes anything. `npm run db:seed:demo -- --undo`
// removes exactly what this script created (matched by title — see DEMO_EVENT_TITLES below).

loadEnv({ path: '.env.local' });
loadEnv();

// Imported dynamically, AFTER the env files are loaded: the shared Prisma client builds its pg
// adapter from `process.env.DATABASE_URL` at module scope, and a static `import` would be hoisted
// above the `loadEnv()` calls — the connection string would still be undefined and the pool would
// fail authentication before a single query ran.
const { prisma } = await import('../src/modules/shared/lib/prisma');

const DEMO_PROFILE = {
  fullName: 'Dr. Amara Osei',
  title: 'Professor of Information Security',
  bio: 'Amara Osei studies how large systems fail under adversarial pressure, and how the people who operate them can be given better tools to notice when they are failing. Her group works across applied cryptography, systems security and the human factors that decide whether a defence actually holds in practice.',
  positionAffiliation: 'Chair of Applied Security · Department of Computing, Northgate University',
  researchStatement:
    'Security properties that hold only on paper are not security properties. My research programme is built on measuring real deployments — protocol implementations, key-management workflows, incident-response practice — and feeding what breaks there back into designs that survive contact with production.',
};

// CV entries. One flat list with a `section` on each row — the shape the `cv_entry` table stores,
// rather than seven separate arrays hanging off the profile (ADR-012). `sortOrder` is per section.
const DEMO_CV_ENTRIES = [
  {
    section: 'education',
    title: 'PhD, Computer Science',
    subtitle: 'Northgate University',
    year: '2009',
    sortOrder: 0,
  },
  {
    section: 'education',
    title: 'MSc, Cryptography',
    subtitle: 'University of Rhyswick',
    year: '2005',
    sortOrder: 1,
  },
  {
    section: 'education',
    title: 'BSc, Mathematics',
    subtitle: 'University of Rhyswick',
    year: '2003',
    sortOrder: 2,
  },

  {
    section: 'fellowship',
    title: 'Visiting Researcher',
    subtitle: 'Institute for Secure Systems, Aalborg',
    year: '2021',
    sortOrder: 0,
  },
  {
    section: 'fellowship',
    title: 'Senior Fellow',
    subtitle: 'National Cyber Resilience Programme',
    year: '2018–2020',
    sortOrder: 1,
  },

  {
    section: 'scholarship',
    title: 'Doctoral Scholarship',
    subtitle: 'Rhyswick Trust',
    year: '2005–2009',
    sortOrder: 0,
  },
  {
    section: 'scholarship',
    title: 'Conference Travel Award',
    subtitle: 'European Security Forum',
    year: '2016',
    sortOrder: 1,
  },

  {
    section: 'research_interest',
    title: 'Applied cryptography',
    description: 'Protocol design and the gap between specification and implementation.',
    sortOrder: 0,
  },
  {
    section: 'research_interest',
    title: 'Systems security',
    description: 'Isolation, supply-chain integrity and trustworthy build pipelines.',
    sortOrder: 1,
  },
  {
    section: 'research_interest',
    title: 'Human factors',
    description: 'How operators and developers actually make security decisions under load.',
    sortOrder: 2,
  },
  {
    section: 'research_interest',
    title: 'Security measurement',
    description: 'Large-scale empirical study of deployed defences.',
    sortOrder: 3,
  },

  {
    section: 'invited_talk',
    title: 'Why Your Threat Model Is a Wish List',
    subtitle: 'European Security Forum',
    year: '2024',
    sortOrder: 0,
  },
  {
    section: 'invited_talk',
    title: 'Key Rotation Nobody Performs',
    subtitle: 'Northgate Industry Day',
    year: '2023',
    sortOrder: 1,
  },
  {
    section: 'invited_talk',
    title: 'Measuring Defences That Were Never Tested',
    subtitle: 'Institute for Secure Systems',
    year: '2022',
    sortOrder: 2,
  },

  {
    section: 'teaching_role',
    title: 'Module Convenor, Applied Cryptography',
    subtitle: 'Postgraduate core module',
    year: '2014–present',
    sortOrder: 0,
  },
  {
    section: 'teaching_role',
    title: 'Doctoral Supervisor',
    subtitle: 'Department of Computing',
    year: '2011–present',
    sortOrder: 1,
  },

  {
    section: 'teaching_award',
    title: 'Faculty Teaching Prize',
    subtitle: 'Northgate University',
    year: '2022',
    sortOrder: 0,
  },
  {
    section: 'teaching_award',
    title: 'Student-Nominated Supervisor of the Year',
    subtitle: 'Department of Computing',
    year: '2019',
    sortOrder: 1,
  },
] as const;

// Courses taught. Grouped by `level` on the public Teaching tab, in the order the first course of
// each level appears here.
const DEMO_COURSES = [
  {
    code: 'CS 7420',
    title: 'Applied Cryptography',
    level: 'Postgraduate',
    term: 'Autumn 2026',
    description:
      'Protocol design, key management and the distance between a specification and the code that ships. Coursework is a build-and-break exercise on a real library.',
    sortOrder: 0,
  },
  {
    code: 'CS 7455',
    title: 'Incident Response Practicum',
    level: 'Postgraduate',
    term: 'Spring 2027',
    description:
      'A hands-on elective run against recorded incidents. Students work in rotation as responder, scribe and communications lead.',
    sortOrder: 1,
  },
  {
    code: 'CS 3310',
    title: 'Secure Systems Engineering',
    level: 'Undergraduate',
    term: 'Autumn 2026',
    description:
      'Final-year core module on isolation, least privilege and supply-chain integrity, taught through the failures rather than the theory.',
    sortOrder: 2,
  },
  {
    code: 'CS 2140',
    title: 'Foundations of Computer Security',
    level: 'Undergraduate',
    term: 'Spring 2027',
    description:
      'Second-year introduction: threat modelling, authentication, and why most real breaches need no cryptography at all.',
    sortOrder: 3,
  },
];

const DEMO_RESEARCH = [
  {
    title: 'Verifiable Build Pipelines for Critical Infrastructure',
    summary:
      'A reproducible-build toolchain that lets an operator prove a deployed binary corresponds to reviewed source, with attestations that survive vendor handover.',
    area: 'Systems Security',
    // Two of these four carry contributors and two deliberately carry none. The empty ones are the
    // demo of "the professor's own solo work renders no byline" — the case most likely to regress
    // without anyone noticing.
    contributors: ['Rasmus Lindqvist', 'Tobias Meyer'],
    sortOrder: 1,
  },
  {
    title: 'Key Management as an Operational Practice',
    summary:
      'A longitudinal study of rotation, escrow and revocation in mid-size organisations, and why documented procedures diverge from what operators do at 3am.',
    area: 'Applied Cryptography',
    contributors: [],
    sortOrder: 2,
  },
  {
    title: 'Adversarial Load Testing for Detection Pipelines',
    summary:
      'Techniques for stress-testing SIEM and detection rules against attackers who know the rules exist, including measurement of alert fatigue thresholds.',
    area: 'Security Measurement',
    contributors: ['Sophie Whitcombe'],
    sortOrder: 3,
  },
  {
    title: 'Consent and Comprehension in Security Warnings',
    summary:
      'Field work on whether interstitial warnings change behaviour, and what a warning has to say to be acted on rather than dismissed.',
    area: 'Human Factors',
    contributors: [],
    sortOrder: 4,
  },
];

const DEMO_PUBLICATIONS = [
  {
    title: 'Reproducible Builds in Practice: A Four-Year Field Study',
    authors: ['A. Osei', 'R. Lindqvist', 'T. Meyer'],
    venue: 'Transactions on Secure Computing',
    year: 2025,
    link: 'https://example.org/publications/reproducible-builds-field-study',
  },
  {
    title: 'The Rotation Gap: Key Management Between Policy and Practice',
    authors: ['A. Osei', 'N. Haddad'],
    venue: 'International Conference on Applied Cryptography',
    year: 2024,
    link: 'https://example.org/publications/rotation-gap',
  },
  {
    title: 'Detection Rules Under Adversarial Load',
    authors: ['P. Ferreira', 'A. Osei'],
    venue: 'Symposium on Security Measurement',
    year: 2023,
    link: 'https://example.org/publications/detection-rules-adversarial-load',
  },
  {
    title: 'What Operators Actually Read: Warning Comprehension at Scale',
    authors: ['A. Osei', 'S. Whitcombe', 'J. Park'],
    venue: 'Conference on Human Factors in Computing Security',
    year: 2022,
    link: 'https://example.org/publications/warning-comprehension',
  },
  {
    title: 'Supply-Chain Attestations Without a Trusted Vendor',
    authors: ['R. Lindqvist', 'A. Osei'],
    venue: 'Workshop on Trustworthy Systems',
    year: 2021,
    link: 'https://example.org/publications/attestations-without-trusted-vendor',
  },
];

const DEMO_GROUPS = [
  {
    name: 'Applied Cryptography Lab',
    description:
      'Protocol design, implementation review and the long tail of key-management practice in deployed systems.',
    members: [
      {
        name: 'Nadia Haddad',
        role: 'Senior Researcher',
        bio: 'Works on key escrow and revocation in federated deployments.',
        sortOrder: 1,
      },
      {
        name: 'Tobias Meyer',
        role: 'PhD Candidate',
        bio: 'Studying formal verification of TLS implementations.',
        sortOrder: 2,
      },
      {
        name: 'Yuki Tanaka',
        role: 'PhD Candidate',
        bio: 'Post-quantum migration paths for long-lived signing keys.',
        sortOrder: 3,
      },
    ],
  },
  {
    name: 'Secure Systems Group',
    description:
      'Isolation, supply-chain integrity and reproducible builds for infrastructure that cannot be taken offline.',
    members: [
      {
        name: 'Rasmus Lindqvist',
        role: 'Postdoctoral Researcher',
        bio: 'Builds attestation tooling for air-gapped deployments.',
        sortOrder: 1,
      },
      {
        name: 'Chidi Nwosu',
        role: 'PhD Candidate',
        bio: 'Container escape analysis in multi-tenant clusters.',
        sortOrder: 2,
      },
    ],
  },
  {
    name: 'Security & Human Factors Unit',
    description:
      'Empirical study of how developers and operators make security decisions, and what tooling changes those decisions.',
    members: [
      {
        name: 'Sophie Whitcombe',
        role: 'Senior Researcher',
        bio: 'Field studies of incident-response teams under time pressure.',
        sortOrder: 1,
      },
      {
        name: 'Jae-won Park',
        role: 'Research Assistant',
        bio: 'Instrumentation and analysis for large-scale warning studies.',
        sortOrder: 2,
      },
    ],
  },
];

/** No research group — exercises the Team Members tab's ungrouped section. */
const DEMO_UNGROUPED_MEMBERS = [
  {
    name: 'Prof. Elena Vasquez',
    role: 'Visiting Professor',
    bio: 'On sabbatical from the Institute for Secure Systems, Aalborg.',
    sortOrder: 1,
  },
  {
    name: 'Dr. Marcus Bell',
    role: 'Industry Fellow',
    bio: 'Splits time between the department and a national CERT.',
    sortOrder: 2,
  },
];

function daysFromNow(days: number, hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function seed() {
  // Profile is a singleton: overwrite whatever placeholder row exists rather than skipping, since
  // an empty auto-created row is exactly what demo content is meant to replace.
  const existingProfile = await prisma.profile.findFirst();
  if (existingProfile) {
    await prisma.profile.update({ where: { id: existingProfile.id }, data: DEMO_PROFILE });
  } else {
    await prisma.profile.create({ data: DEMO_PROFILE });
  }
  console.log('profile: seeded');

  if ((await prisma.cvEntry.count()) === 0) {
    await prisma.cvEntry.createMany({ data: [...DEMO_CV_ENTRIES] });
    console.log(`cv entries: ${DEMO_CV_ENTRIES.length} created`);
  } else {
    console.log('cv entries: rows already present — skipped');
  }

  if ((await prisma.course.count()) === 0) {
    await prisma.course.createMany({ data: DEMO_COURSES });
    console.log(`courses: ${DEMO_COURSES.length} created`);
  } else {
    console.log('courses: rows already present — skipped');
  }

  if ((await prisma.researchGroup.count()) === 0) {
    for (const { members, ...group } of DEMO_GROUPS) {
      await prisma.researchGroup.create({
        data: { ...group, teamMembers: { create: members } },
      });
    }
    await prisma.teamMember.createMany({ data: DEMO_UNGROUPED_MEMBERS });
    const grouped = DEMO_GROUPS.reduce((n, g) => n + g.members.length, 0);
    console.log(
      `research groups: ${DEMO_GROUPS.length} created, ${grouped} grouped + ${DEMO_UNGROUPED_MEMBERS.length} ungrouped members`,
    );
  } else {
    console.log('research groups: rows already present — skipped');
  }

  // Research and publications are seeded AFTER the team, so their credited names can be matched
  // back to real member rows. Without at least one linked row nothing in the demo data exercises
  // the `teamMemberId` path — not the picker's already-credited filter, and not the SetNull that
  // keeps a byline intact when a member is deleted.
  //
  // Matched on surname because the demo bylines are written the way a citation is ("R. Lindqvist")
  // while the team rows hold full names ("Rasmus Lindqvist"). A name that matches nobody stays
  // unlinked, which is exactly right for an outside co-author.
  const seededMembers = await prisma.teamMember.findMany({ select: { id: true, name: true } });
  const memberIdBySurname = new Map(
    seededMembers.map((member) => [member.name.split(' ').at(-1)?.toLowerCase(), member.id]),
  );
  const linkOf = (name: string) =>
    memberIdBySurname.get(name.split(' ').at(-1)?.toLowerCase()) ?? null;
  const toRows = (names: string[]) =>
    names.map((name, sortOrder) => ({ name, teamMemberId: linkOf(name), sortOrder }));

  if ((await prisma.research.count()) === 0) {
    for (const { contributors, ...work } of DEMO_RESEARCH) {
      await prisma.research.create({
        data: { ...work, contributors: { create: toRows(contributors) } },
      });
    }
    console.log(`research: ${DEMO_RESEARCH.length} created`);
  } else {
    console.log('research: rows already present — skipped');
  }

  if ((await prisma.publication.count()) === 0) {
    // `createMany` cannot do nested writes, so these go one at a time. Five round trips in a seed
    // script costs nothing.
    for (const { authors, ...publication } of DEMO_PUBLICATIONS) {
      await prisma.publication.create({
        data: { ...publication, authors: { create: toRows(authors) } },
      });
    }
    console.log(`publications: ${DEMO_PUBLICATIONS.length} created`);
  } else {
    console.log('publications: rows already present — skipped');
  }

  if ((await prisma.event.count()) === 0) {
    // A spread of dates either side of today, so the public Events tab has content in both its
    // Upcoming and Past sections without the seed having to know what "now" is. Media are left
    // empty: photo URLs would have to point at a real R2 bucket, and a broken <img> in demo data
    // is worse than no gallery.
    await prisma.event.createMany({
      data: [
        {
          title: 'Guest lecture: post-quantum key rotation in practice',
          description:
            'A walkthrough of what migrating a live key hierarchy to post-quantum primitives actually costs, using tooling built with the Applied Cryptography Lab.',
          eventDate: daysFromNow(16, 11),
        },
        {
          title: 'Workshop — reproducible build attestations',
          description:
            'Hands-on session on attesting builds end to end, run with the Secure Systems Group. Bring a laptop.',
          eventDate: daysFromNow(9, 14),
        },
        {
          title: 'Departmental seminar: warning comprehension in banking apps',
          description:
            'Results from a joint study with the Security & Human Factors Unit on whether anyone reads the warnings we ship.',
          eventDate: daysFromNow(4, 10),
        },
        {
          title: 'Panel: teaching security to non-specialists',
          description:
            'Faculty panel on getting security fundamentals across to students who will never write a line of C.',
          eventDate: daysFromNow(-12, 15),
        },
        {
          title: 'Invited talk — threat modelling for small teams',
          description:
            'What survives when you strip threat modelling down to something a four-person team will actually do every sprint.',
          eventDate: daysFromNow(-40, 13),
        },
      ],
    });
    console.log('events: 5 created (3 upcoming, 2 past)');
  } else {
    console.log('events: rows already present — skipped');
  }
}

const DEMO_EVENT_TITLES = [
  'Guest lecture: post-quantum key rotation in practice',
  'Workshop — reproducible build attestations',
  'Departmental seminar: warning comprehension in banking apps',
  'Panel: teaching security to non-specialists',
  'Invited talk — threat modelling for small teams',
];

async function undo() {
  const events = await prisma.event.deleteMany({
    where: { title: { in: DEMO_EVENT_TITLES } },
  });
  const courses = await prisma.course.deleteMany({
    where: { title: { in: DEMO_COURSES.map((c) => c.title) } },
  });
  const cvEntries = await prisma.cvEntry.deleteMany({
    where: { title: { in: DEMO_CV_ENTRIES.map((e) => e.title) } },
  });
  const members = await prisma.teamMember.deleteMany({
    where: {
      OR: [
        { researchGroup: { name: { in: DEMO_GROUPS.map((g) => g.name) } } },
        { name: { in: DEMO_UNGROUPED_MEMBERS.map((m) => m.name) } },
      ],
    },
  });
  const groups = await prisma.researchGroup.deleteMany({
    where: { name: { in: DEMO_GROUPS.map((g) => g.name) } },
  });
  const publications = await prisma.publication.deleteMany({
    where: { title: { in: DEMO_PUBLICATIONS.map((p) => p.title) } },
  });
  const research = await prisma.research.deleteMany({
    where: { title: { in: DEMO_RESEARCH.map((r) => r.title) } },
  });

  console.log(
    `undo: ${research.count} research, ${publications.count} publications, ${groups.count} groups, ` +
      `${members.count} team members, ${events.count} events, ${courses.count} courses, ` +
      `${cvEntries.count} CV entries removed. ` +
      'Authorship rows cascade from their publication/research, so they need no delete of their own. ' +
      'Profile left as-is (edit it in the admin UI).',
  );
}

const shouldUndo = process.argv.includes('--undo');

(shouldUndo ? undo() : seed())
  .catch((error) => {
    console.error(shouldUndo ? 'Demo undo failed:' : 'Demo seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
