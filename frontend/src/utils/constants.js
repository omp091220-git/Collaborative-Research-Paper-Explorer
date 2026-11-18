export const ROLES = {
  STUDENT: 'STUDENT',
  RESEARCHER: 'RESEARCHER',
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
};

export const ROLE_LABELS = {
  [ROLES.STUDENT]: 'Student',
  [ROLES.RESEARCHER]: 'Researcher',
  [ROLES.SYSTEM_ADMIN]: 'System Administrator',
};

export const ROLE_COLORS = {
  [ROLES.STUDENT]: {
    bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    dot: 'bg-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  },
  [ROLES.RESEARCHER]: {
    bg: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
    dot: 'bg-violet-400',
    badge: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  },
  [ROLES.SYSTEM_ADMIN]: {
    bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    dot: 'bg-amber-400',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  },
};

export const MAX_PDF_SIZE_BYTES = 31_457_280; // 30 MiB
export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const WARNING_THRESHOLD_MS = 28 * 60 * 1000; // 28 minutes

export const RESEARCH_AREAS = [
  'Artificial Intelligence',
  'Machine Learning',
  'Computer Vision',
  'Natural Language Processing',
  'Robotics',
  'Quantum Computing',
  'Distributed Systems',
  'Cryptography & Security',
  'Bioinformatics',
  'Data Science',
  'Human-Computer Interaction',
  'Software Engineering',
];

export const SUMMARY_TYPES = [
  { id: 'comprehensive', label: 'Comprehensive', description: 'Detailed breakdown with background, methodology, and conclusions.' },
  { id: 'brief', label: 'Brief / Executive', description: 'High-level 2-minute overview of core contributions.' },
  { id: 'technical', label: 'Technical Depth', description: 'Focus on mathematical formulation, architecture, and proofs.' },
  { id: 'layperson', label: 'Plain English', description: 'Accessible explanation for non-specialists.' },
];
