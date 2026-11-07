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
    bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  [ROLES.RESEARCHER]: {
    bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    dot: 'bg-indigo-500',
    badge: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  },
  [ROLES.SYSTEM_ADMIN]: {
    bg: 'bg-purple-50 text-purple-700 border-purple-200',
    dot: 'bg-purple-500',
    badge: 'bg-purple-100 text-purple-800 border-purple-200',
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
