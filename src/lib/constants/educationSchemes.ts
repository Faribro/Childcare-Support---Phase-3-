/**
 * educationSchemes.ts
 *
 * Central and State School Education Initiatives & Schemes in India.
 */

export interface EducationSchemeCategory {
  category: string;
  schemes: {
    value: string;
    label: string;
    description?: string;
  }[];
}

export const EDUCATION_SCHEME_CATEGORIES: EducationSchemeCategory[] = [
  {
    category: 'Systemic & Foundational School Schemes',
    schemes: [
      {
        value: 'Samagra Shiksha Abhiyan',
        label: 'Samagra Shiksha Abhiyan',
        description: 'Free textbooks, uniforms, school infrastructure & transport (Pre-school to Class XII)',
      },
      {
        value: 'PM POSHAN (Mid-Day Meal Scheme)',
        label: 'PM POSHAN (Mid-Day Meal Scheme)',
        description: 'Free hot cooked meal daily in government / aided schools (Balvatika to Class VIII)',
      },
      {
        value: 'PM SHRI (PM Schools for Rising India)',
        label: 'PM SHRI (PM Schools for Rising India)',
        description: 'Model government schools showcasing NEP 2020 infrastructure & smart classrooms',
      },
      {
        value: 'NIPUN Bharat Mission',
        label: 'NIPUN Bharat Mission',
        description: 'Foundational literacy and numeracy by Grade 3',
      },
      {
        value: 'PM e-VIDYA & DIKSHA',
        label: 'PM e-VIDYA & DIKSHA',
        description: 'Multi-mode digital education, TV lessons and DIKSHA e-textbooks',
      },
      {
        value: 'STARS Project',
        label: 'STARS Project',
        description: 'Strengthening Teaching-Learning and Results for States',
      },
      {
        value: 'Vidyanjali 2.0',
        label: 'Vidyanjali 2.0',
        description: 'School volunteer and resource contribution program',
      },
      {
        value: 'ULLAS (New India Literacy Programme)',
        label: 'ULLAS (New India Literacy Programme)',
        description: 'Foundational literacy and life skills for youth aged 15+',
      },
    ],
  },
  {
    category: 'Targeted & Residential School Schemes',
    schemes: [
      {
        value: 'Right to Education (RTE) 25% Quota',
        label: 'Right to Education (RTE) 25% Quota',
        description: 'Free education & 25% entry-level seat reservation in private unaided schools (Ages 6-14)',
      },
      {
        value: 'Kasturba Gandhi Balika Vidyalaya (KGBV)',
        label: 'Kasturba Gandhi Balika Vidyalaya (KGBV)',
        description: 'Residential upper-primary & secondary schools for girls (SC/ST/OBC/Minority/BPL)',
      },
      {
        value: 'Eklavya Model Residential School (EMRS)',
        label: 'Eklavya Model Residential School (EMRS)',
        description: 'Free residential schooling for Scheduled Tribe (ST) students (Classes VI-XII)',
      },
      {
        value: 'Beti Bachao, Beti Padhao',
        label: 'Beti Bachao, Beti Padhao',
        description: 'Girl child education enrollment and protection initiatives',
      },
      {
        value: 'PM CARES for Children',
        label: 'PM CARES for Children',
        description: 'School fees, books, uniforms & health support for children orphaned during COVID-19',
      },
    ],
  },
  {
    category: 'Direct School Scholarships (NSP & Ministries)',
    schemes: [
      {
        value: 'National Means-Cum-Merit Scholarship (NMMSS)',
        label: 'National Means-Cum-Merit Scholarship (NMMSS)',
        description: '₹12,000/year for meritorious students from low-income families (Classes IX-XII)',
      },
      {
        value: 'PM YASASVI',
        label: 'PM YASASVI (Top Class Education in Schools)',
        description: 'Tuition and hostel assistance for meritorious OBC, EBC & DNT students (Classes IX-XII)',
      },
      {
        value: 'Pre-Matric Scholarship (SC / ST / OBC / Minorities)',
        label: 'Pre-Matric Scholarship (SC / ST / OBC / Minorities)',
        description: 'Ministry scholarships covering books, ad-hoc grants & stipends (up to Class X)',
      },
      {
        value: 'Pre-Matric Scholarship for Students with Disabilities',
        label: 'Pre-Matric Scholarship for Students with Disabilities',
        description: 'Maintenance allowance and disability book grants (Classes IX-X)',
      },
      {
        value: 'Schemes for Wards of Workers (Beedi / Cine / Mine)',
        label: 'Schemes for Wards of Workers (Beedi / Cine / Mine)',
        description: 'Ministry of Labour & Employment financial aid (₹1,000 to ₹25,000)',
      },
      {
        value: 'PM Scholarship Scheme (PMSS)',
        label: 'PM Scholarship Scheme (PMSS)',
        description: 'Support for wards & widows of ex-servicemen, CAPF and Coast Guard',
      },
    ],
  },
  {
    category: 'State-Specific & Other Local Schemes',
    schemes: [
      {
        value: 'State Government Scheme (Bicycle, Laptop, Uniform, or Stipend)',
        label: 'State Government Scheme (Bicycle, Laptop, Uniform, or Stipend)',
        description: 'State-specific welfare and localized educational stipends',
      },
      {
        value: 'Other Scheme (specify)',
        label: 'Other Scheme (specify)',
        description: 'Any other central, state, or NGO educational grant',
      },
    ],
  },
];

export const OTHER_SPECIFY_SCHEME = 'Other Scheme (specify)';
export const STATE_SPECIFIC_SCHEME = 'State Government Scheme (Bicycle, Laptop, Uniform, or Stipend)';

export function isSchemeSpecifyRequired(schemeName?: string): boolean {
  return schemeName === OTHER_SPECIFY_SCHEME || schemeName === STATE_SPECIFIC_SCHEME;
}
