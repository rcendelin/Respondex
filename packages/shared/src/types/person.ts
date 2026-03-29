// Domain types for synthetic persons (syntetické osoby)

export enum Gender {
  MALE = 'Muž',
  FEMALE = 'Žena',
}

export enum Education {
  NO_EDUCATION = 'Bez vzdělání',
  PRIMARY = 'Základní',
  VOCATIONAL = 'Vyučení',
  SECONDARY = 'S maturitou',
  HIGHER_VOCATIONAL = 'Vyšší odborné',
  HIGHER_VOCATIONAL_CONSERVATORY = 'Vyšší odborné / konzervatoř',
  UNIVERSITY = 'Vysokoškolské',
  UNKNOWN = 'Nezjištěno',
}

export enum MaritalStatus {
  SINGLE = 'Svobodný/á',
  MARRIED = 'Ženatý/Vdaná',
  DIVORCED = 'Rozvedený/á',
  WIDOWED = 'Ovdovělý/á',
  PARTNERSHIP = 'Registrované partnerství',
}

export enum EmploymentStatus {
  EMPLOYED = 'Zaměstnaný/á',
  SELF_EMPLOYED = 'Podnikatel/ka (OSVČ)',
  UNEMPLOYED = 'Nezaměstnaný/á',
  STUDENT = 'Student/ka',
  RETIRED = 'Důchodce/kyně',
  MATERNITY_LEAVE = 'Mateřská/rodičovská dovolená',
  ECONOMICALLY_INACTIVE = 'Ekonomicky neaktivní jinak',
  OTHER = 'Jiné',
}

export enum IncomeLevel {
  LOW = 'Nízký',
  LOWER_MIDDLE = 'Spíše nižší',
  MIDDLE = 'Střední',
  UPPER_MIDDLE = 'Spíše vyšší',
  HIGH = 'Vysoký',
}

export enum Region {
  PRAGUE = 'Praha',
  CENTRAL_BOHEMIA = 'Středočeský',
  SOUTH_BOHEMIA = 'Jihočeský',
  PLZEN = 'Plzeňský',
  KARLOVY_VARY = 'Karlovarský',
  USTI = 'Ústecký',
  LIBEREC = 'Liberecký',
  HRADEC_KRALOVE = 'Královéhradecký',
  PARDUBICE = 'Pardubický',
  VYSOCINA = 'Kraj Vysočina',
  SOUTH_MORAVIA = 'Jihomoravský',
  OLOMOUC = 'Olomoucký',
  ZLIN = 'Zlínský',
  MORAVIAN_SILESIA = 'Moravskoslezský',
}

export interface Demographics {
  /** Nationality / citizenship (default: 'ČR') */
  nationality?: string
  education?: Education
  marital_status?: MaritalStatus
  has_partner?: boolean
  employment_status?: EmploymentStatus
  income_level?: IncomeLevel
  region?: Region
  /** PIAAC numeracy proficiency level (assigned from reference data distributions) */
  numeracy_level?: import('./numeracy.js').NumeracyLevel
  /** Continuous PIAAC numeracy score (0–500), derived from demographics */
  piaac_score?: number
  /** Any additional custom demographic fields from XLSX */
  custom_fields?: Record<string, string | number | boolean>
}

export interface Person {
  id: string
  /** Age in years (18–100) */
  age: number
  gender: Gender
  demographics?: Demographics
  /** Optional life story for Strategy C (Manual Narrative) */
  life_story?: string
}

export interface PersonMetadata {
  id: string
  name: string
  description?: string
  created_at: string
  person_count: number
}
