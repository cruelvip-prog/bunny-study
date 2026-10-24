export interface SampleQuestion {
  num: number;
  section: string;
  question: string;
  options: { A: string; B: string; C: string; D: string };
}

export const SAMPLE_QUESTIONS_DATA: SampleQuestion[] = [
  // Physics Sample
  {
    num: 1,
    section: 'Physics',
    question: 'A projectile is fired at an angle theta with the horizontal with velocity u. The radius of curvature at the highest point of its trajectory is:',
    options: {
      A: '(u^2 * sin^2(theta)) / g',
      B: '(u^2 * cos^2(theta)) / g',
      C: '(u^2) / g',
      D: '(u^2 * sin(2*theta)) / g'
    }
  },
  {
    num: 2,
    section: 'Physics',
    question: 'The dimensions of universal gravitational constant G are:',
    options: {
      A: '[M^-1 L^2 T^-2]',
      B: '[M^-2 L^3 T^-1]',
      C: '[M^-1 L^3 T^-2]',
      D: '[M^1 L^3 T^-2]'
    }
  },
  {
    num: 3,
    section: 'Physics',
    question: 'An ideal Carnot engine operates between temperatures 500 K and 300 K. Its thermal efficiency is:',
    options: {
      A: '40%',
      B: '60%',
      C: '50%',
      D: '25%'
    }
  },
  {
    num: 4,
    section: 'Physics',
    question: 'Two point charges +4q and +q are placed at distance L. A third charge Q is placed on the line joining them so that all charges are in equilibrium. The position of Q from +4q is:',
    options: {
      A: 'L / 3',
      B: 'L / 4',
      C: '3L / 4',
      D: '2L / 3'
    }
  },
  {
    num: 5,
    section: 'Physics',
    question: 'In Young\'s double slit experiment, if the distance between slits is halved and distance from screen is doubled, fringe width becomes:',
    options: {
      A: 'Halved',
      B: 'Four times',
      C: 'Double',
      D: 'Unchanged'
    }
  },
  // Chemistry Sample
  {
    num: 46,
    section: 'Chemistry',
    question: 'Which of the following compounds exhibits maximum paramagnetic character?',
    options: {
      A: '[Fe(CN)6]^3-',
      B: '[Co(NH3)6]^3+',
      C: '[Fe(H2O)6]^3+',
      D: '[Zn(H2O)6]^2+'
    }
  },
  {
    num: 47,
    section: 'Chemistry',
    question: 'The order of acidic strength of halogen hydrides is:',
    options: {
      A: 'HF < HCl < HBr < HI',
      B: 'HI < HBr < HCl < HF',
      C: 'HCl < HF < HBr < HI',
      D: 'HF < HBr < HCl < HI'
    }
  },
  {
    num: 48,
    section: 'Chemistry',
    question: 'The rate constant of a first order reaction is 6.93 x 10^-3 s^-1. The half-life period t_1/2 of the reaction is:',
    options: {
      A: '50 s',
      B: '100 s',
      C: '69.3 s',
      D: '10 s'
    }
  },
  // Botany Sample
  {
    num: 91,
    section: 'Botany',
    question: 'The site of light-independent reactions (dark reaction) in photosynthesis inside a chloroplast is the:',
    options: {
      A: 'Thylakoid membrane',
      B: 'Grana',
      C: 'Lumen',
      D: 'Stroma'
    }
  },
  {
    num: 92,
    section: 'Botany',
    question: 'In Mendel\'s dihybrid cross between round yellow and wrinkled green seeds, phenotypic ratio in F2 generation is:',
    options: {
      A: '3 : 1',
      B: '9 : 3 : 3 : 1',
      C: '1 : 2 : 1',
      D: '9 : 7'
    }
  },
  // Zoology Sample
  {
    num: 136,
    section: 'Zoology',
    question: 'Which hormone is directly responsible for ovulation in human females by inducing LH surge?',
    options: {
      A: 'Luteinizing Hormone (LH)',
      B: 'Progesterone',
      C: 'Oxytocin',
      D: 'Prolactin'
    }
  },
  {
    num: 137,
    section: 'Zoology',
    question: 'The functional and structural unit of human kidneys is called the:',
    options: {
      A: 'Neuron',
      B: 'Alveolus',
      C: 'Nephron',
      D: 'Glomerulus'
    }
  }
];

/**
 * Creates the built-in incomplete demonstration PDF.
 */
export function generateSampleNeetPdf(totalQuestions: number = 180): Blob {
  // We construct a clean multi-page PDF document
  // 5 pages: Title/General Instructions, Physics, Chemistry, Botany, Zoology
  const pages: string[] = [];

  // Page 1: Front Page & General NTA Instructions
  pages.push(`
q
0.1 0.25 0.55 rg
10 790 575 40 re f
0.15 0.35 0.7 rg
15 745 565 30 re f
1 1 1 rg
BT /F1 18 Tf 20 805 Td (INCOMPLETE DEMO PRACTICE PAPER) Tj ET
BT /F2 11 Tf 22 757 Td (NOT A COMPLETE NEET PAPER - NO SOURCE-VERIFIED ANSWER KEY) Tj ET

0 0 0 rg
BT /F1 13 Tf 20 710 Td (IMPORTANT INSTRUCTIONS FOR CANDIDATES) Tj ET
BT /F2 9.5 Tf 20 685 Td (This incomplete demo contains partial examples and draft prompts.) Tj ET
BT /F2 9.5 Tf 20 670 Td (It is not a complete 180-question NEET paper and must not be treated as a scored mock.) Tj ET
BT /F2 9.5 Tf 20 655 Td (No answer key has been independently verified for this demo.) Tj ET
BT /F2 9.5 Tf 20 625 Td (1. CBT interface navigation and palette indicators:) Tj ET
0.2 0.7 0.3 rg 25 533 12 12 re f
0 0 0 rg BT /F2 9 Tf 45 536 Td (Green : Question answered and saved) Tj ET
0.85 0.2 0.2 rg 25 513 12 12 re f
0 0 0 rg BT /F2 9 Tf 45 516 Td (Red : Visited question but not answered) Tj ET
0.6 0.6 0.6 rg 25 493 12 12 re f
0 0 0 rg BT /F2 9 Tf 45 496 Td (Grey : Not yet visited) Tj ET
0.5 0.2 0.8 rg 25 473 12 12 re f
0 0 0 rg BT /F2 9 Tf 45 476 Td (Purple : Marked for review (with or without answer)) Tj ET

0 0 0 rg
BT /F1 12 Tf 20 435 Td (DEMO EXCERPT : PHYSICS) Tj ET
BT /F1 10 Tf 20 410 Td (Q.1) Tj ET
BT /F2 9.5 Tf 45 410 Td (A projectile is launched with velocity u at angle theta. Radius of curvature at highest point:) Tj ET
BT /F2 9 Tf 45 395 Td ((A) (u^2 sin^2 theta)/g    (B) (u^2 cos^2 theta)/g    (C) u^2/g    (D) (u^2 sin 2theta)/g) Tj ET

BT /F1 10 Tf 20 370 Td (Q.2) Tj ET
BT /F2 9.5 Tf 45 370 Td (Dimensional formula of universal gravitational constant G is:) Tj ET
BT /F2 9 Tf 45 355 Td ((A) [M^-1 L^2 T^-2]       (B) [M^-2 L^3 T^-1]       (C) [M^-1 L^3 T^-2]       (D) [M^1 L^3 T^-2]) Tj ET

BT /F1 10 Tf 20 330 Td (Q.3) Tj ET
BT /F2 9.5 Tf 45 330 Td (A Carnot engine operates between 500 K and 300 K. Efficiency of this cycle is:) Tj ET
BT /F2 9 Tf 45 315 Td ((A) 40%                   (B) 60%                   (C) 50%                   (D) 25%) Tj ET

BT /F1 10 Tf 20 290 Td (Q.4) Tj ET
BT /F2 9.5 Tf 45 290 Td (Two charges +4q and +q separated by L. For equilibrium, third charge Q placed at:) Tj ET
BT /F2 9 Tf 45 275 Td ((A) L/3 from +4q          (B) L/4 from +4q          (C) 3L/4 from +4q         (D) 2L/3 from +4q) Tj ET

BT /F1 10 Tf 20 250 Td (Q.5) Tj ET
BT /F2 9.5 Tf 45 250 Td (In YDSE, slit separation is halved and screen distance is doubled. Fringe width becomes:) Tj ET
BT /F2 9 Tf 45 235 Td ((A) Halved                (B) Four times            (C) Double                (D) Unchanged) Tj ET

0.7 0.7 0.7 RG 1 w 20 215 555 0 m 575 215 l S
BT /F2 8.5 Tf 220 200 Td ([ Scroll or navigate to Page 2 for Remaining Questions ] ) Tj ET
Q
`);

  // Page 2: Physics Q6 - Q45
  pages.push(`
q
0.1 0.25 0.55 rg 10 790 575 35 re f
1 1 1 rg BT /F1 14 Tf 20 802 Td (SECTION 1 : PHYSICS (CONTINUED Q.6 - Q.45)) Tj ET
0 0 0 rg
BT /F1 10 Tf 20 760 Td (Q.6) Tj ET
BT /F2 9.5 Tf 45 760 Td (The de-Broglie wavelength of an electron accelerated through potential V is proportional to:) Tj ET
BT /F2 9 Tf 45 745 Td ((A) 1 / sqrt(V)           (B) sqrt(V)               (C) V^2                   (D) 1 / V) Tj ET

BT /F1 10 Tf 20 720 Td (Q.7) Tj ET
BT /F2 9.5 Tf 45 720 Td (Magnetic field at center of circular coil of radius R carrying current I is B. Field at distance R on axis:) Tj ET
BT /F2 9 Tf 45 705 Td ((A) B / 2                 (B) B / 4                 (C) B / (2*sqrt(2))       (D) B / sqrt(2)) Tj ET

BT /F1 10 Tf 20 680 Td (Q.8) Tj ET
BT /F2 9.5 Tf 45 680 Td (In a pure capacitive AC circuit, current leads the applied voltage by a phase angle of:) Tj ET
BT /F2 9 Tf 45 665 Td ((A) 0 rad                 (B) pi rad                (C) pi / 4 rad            (D) pi / 2 rad) Tj ET

BT /F1 10 Tf 20 640 Td (Q.9) Tj ET
BT /F2 9.5 Tf 45 640 Td (Work done in blowing a soap bubble of radius r to 2r (surface tension T) equals:) Tj ET
BT /F2 9 Tf 45 625 Td ((A) 12 pi r^2 T           (B) 24 pi r^2 T           (C) 8 pi r^2 T            (D) 4 pi r^2 T) Tj ET

BT /F1 10 Tf 20 600 Td (Q.10) Tj ET
BT /F2 9.5 Tf 45 600 Td (If momentum of a body increases by 20%, its kinetic energy increases by:) Tj ET
BT /F2 9 Tf 45 585 Td ((A) 20%                   (B) 40%                   (C) 44%                   (D) 36%) Tj ET

BT /F1 10 Tf 20 550 Td (Q.11 - Q.20 : MECHANICS & OSCILLATIONS) Tj ET
BT /F2 9 Tf 20 535 Td (Q.11: Acceleration due to gravity at depth d is g(1 - d/R). (A) Correct (B) False (C) g(1+d) (D) zero) Tj ET
BT /F2 9 Tf 20 515 Td (Q.12: Time period of simple pendulum of length L in an elevator accelerating upward at a is 2pi*sqrt(L/(g+a)).) Tj ET
BT /F2 9 Tf 20 495 Td (Q.13: Ratio of RMS velocity of Hydrogen to Oxygen at same temperature is 4:1. (A) 1:4 (B) 4:1 (C) 16:1 (D) 2:1) Tj ET
BT /F2 9 Tf 20 475 Td (Q.14: Total internal reflection occurs when light travels from denser to rarer medium and i > critical angle.) Tj ET
BT /F2 9 Tf 20 455 Td (Q.15: Electric flux through closed Gaussian surface depends solely on enclosed charge: q / epsilon_0.) Tj ET

BT /F1 10 Tf 20 415 Td (Q.21 - Q.45 : MODERN PHYSICS & THERMODYNAMICS) Tj ET
BT /F2 9 Tf 20 395 Td (Q.21: Half life of radioactive isotope with decay constant lambda is ln(2)/lambda. (A) 1/l (B) l (C) ln2/l (D) 2l) Tj ET
BT /F2 9 Tf 20 375 Td (Q.22: Binding energy per nucleon is maximum around mass number A = 56 (Iron). (A) 4 (B) 12 (C) 28 (D) 56) Tj ET
BT /F2 9 Tf 20 355 Td (Q.23: Solar cells operate on photovoltaic effect in unbiased p-n junction. (A) True (B) False (C) Zener (D) Tunnel) Tj ET
BT /F2 9 Tf 20 335 Td (Q.24: In an adiabatic process, PV^gamma = constant and no heat enters or leaves the system: dQ = 0.) Tj ET
BT /F2 9 Tf 20 315 Td (Q.25: The ratio of Cp to Cv for a monoatomic ideal gas is 5/3 = 1.67. (A) 7/5 (B) 4/3 (C) 5/3 (D) 9/7) Tj ET
BT /F2 8.5 Tf 20 270 Td (Questions 26 to 45 cover full syllabus numericals and conceptual assertions according to NTA format.) Tj ET
Q
`);

  // Page 3: Chemistry Q46 - Q90
  pages.push(`
q
0.1 0.45 0.35 rg 10 790 575 35 re f
1 1 1 rg BT /F1 14 Tf 20 802 Td (SECTION 2 : CHEMISTRY (QUESTIONS 46 - 90)) Tj ET
0 0 0 rg
BT /F1 10 Tf 20 760 Td (Q.46) Tj ET
BT /F2 9.5 Tf 50 760 Td (Which of the following complex ions exhibits highest paramagnetic character?) Tj ET
BT /F2 9 Tf 50 745 Td ((A) [Fe(CN)6]^3-          (B) [Co(NH3)6]^3+         (C) [Fe(H2O)6]^3+         (D) [Zn(H2O)6]^2+) Tj ET

BT /F1 10 Tf 20 720 Td (Q.47) Tj ET
BT /F2 9.5 Tf 50 720 Td (The correct order of acidic strength of hydrogen halides (HF, HCl, HBr, HI) is:) Tj ET
BT /F2 9 Tf 50 705 Td ((A) HF < HCl < HBr < HI   (B) HI < HBr < HCl < HF   (C) HCl < HF < HBr < HI   (D) HF < HBr < HCl < HI) Tj ET

BT /F1 10 Tf 20 680 Td (Q.48) Tj ET
BT /F2 9.5 Tf 50 680 Td (First order reaction has k = 6.93 x 10^-3 s^-1. Its half-life period (t_1/2) is:) Tj ET
BT /F2 9 Tf 50 665 Td ((A) 50 s                  (B) 100 s                 (C) 69.3 s                (D) 10 s) Tj ET

BT /F1 10 Tf 20 640 Td (Q.49) Tj ET
BT /F2 9.5 Tf 50 640 Td (Which gas is evolved when primary aliphatic amine reacts with nitrous acid (HNO2)?) Tj ET
BT /F2 9 Tf 50 625 Td ((A) NH3                   (B) NO2                   (C) H2                    (D) N2) Tj ET

BT /F1 10 Tf 20 600 Td (Q.50) Tj ET
BT /F2 9.5 Tf 50 600 Td (The geometry of XeF4 molecule according to VSEPR theory is:) Tj ET
BT /F2 9 Tf 50 585 Td ((A) Square planar         (B) Tetrahedral           (C) Octahedral            (D) Trigonal bipyramidal) Tj ET

BT /F1 10 Tf 20 545 Td (Q.51 - Q.70 : ORGANIC & INORGANIC CHEMISTRY) Tj ET
BT /F2 9 Tf 20 525 Td (Q.51: Cannizzaro reaction is given by aldehydes having no alpha-hydrogens (e.g. HCHO, C6H5CHO).) Tj ET
BT /F2 9 Tf 20 505 Td (Q.52: Lucas test is used to distinguish primary, secondary, and tertiary alcohols based on turbidity time.) Tj ET
BT /F2 9 Tf 20 485 Td (Q.53: The oxidation state of Cr in potassium dichromate K2Cr2O7 is +6. (A) +3 (B) +4 (C) +5 (D) +6) Tj ET
BT /F2 9 Tf 20 465 Td (Q.54: In electrochemical cell, standard reduction potential of SHE is defined as exactly 0.00 V.) Tj ET
BT /F2 9 Tf 20 445 Td (Q.55: Glycosidic linkage in sucrose is between alpha-D-glucose and beta-D-fructose.) Tj ET

BT /F1 10 Tf 20 405 Td (Q.71 - Q.90 : PHYSICAL CHEMISTRY & SOLUTIONS) Tj ET
BT /F2 9 Tf 20 385 Td (Q.71: Elevation in boiling point delta_Tb = Kb * m, where m is molality of solute.) Tj ET
BT /F2 9 Tf 20 365 Td (Q.72: The unit of equivalent conductance is Ohm^-1 cm^2 eq^-1 or S cm^2 eq^-1.) Tj ET
BT /F2 9 Tf 20 345 Td (Q.73: Haber process for synthesis of NH3 uses finely divided Fe as catalyst and Mo as promoter.) Tj ET
BT /F2 9 Tf 20 325 Td (Q.74: Hybridisation of carbon in ethyne (HC=CH) is sp with 180 degree bond angle.) Tj ET
BT /F2 9 Tf 20 305 Td (Q.75: Lanthanoid contraction is caused by poor shielding effect of 4f electrons.) Tj ET
Q
`);

  // Page 4: Botany Q91 - Q135
  pages.push(`
q
0.15 0.5 0.2 rg 10 790 575 35 re f
1 1 1 rg BT /F1 14 Tf 20 802 Td (SECTION 3 : BOTANY (QUESTIONS 91 - 135)) Tj ET
0 0 0 rg
BT /F1 10 Tf 20 760 Td (Q.91) Tj ET
BT /F2 9.5 Tf 50 760 Td (The dark reaction (Calvin cycle) of photosynthesis takes place in which region of chloroplast?) Tj ET
BT /F2 9 Tf 50 745 Td ((A) Thylakoid membrane   (B) Grana                 (C) Lumen                 (D) Stroma) Tj ET

BT /F1 10 Tf 20 720 Td (Q.92) Tj ET
BT /F2 9.5 Tf 50 720 Td (Phenotypic ratio obtained in F2 generation of a classic Mendelian dihybrid cross is:) Tj ET
BT /F2 9 Tf 50 705 Td ((A) 3 : 1                 (B) 9 : 3 : 3 : 1         (C) 1 : 2 : 1             (D) 9 : 7) Tj ET

BT /F1 10 Tf 20 680 Td (Q.93) Tj ET
BT /F2 9.5 Tf 50 680 Td (Which phytohormone is commonly called the stress hormone and induces stomatal closure?) Tj ET
BT /F2 9 Tf 50 665 Td ((A) Auxin                 (B) Gibberellin           (C) Abscisic Acid (ABA)   (D) Cytokinin) Tj ET

BT /F1 10 Tf 20 640 Td (Q.94) Tj ET
BT /F2 9.5 Tf 50 640 Td (Double fertilisation is a characteristic unique phenomenon found in:) Tj ET
BT /F2 9 Tf 50 625 Td ((A) Angiosperms           (B) Gymnosperms           (C) Pteridophytes         (D) Bryophytes) Tj ET

BT /F1 10 Tf 20 600 Td (Q.95) Tj ET
BT /F2 9.5 Tf 50 600 Td (Primary CO2 acceptor in C4 pathway (Hatch and Slack pathway) is:) Tj ET
BT /F2 9 Tf 50 585 Td ((A) RuBP                  (B) Oxaloacetate          (C) Phosphoglycerate      (D) PEP (Phosphoenolpyruvate)) Tj ET

BT /F1 10 Tf 20 545 Td (Q.96 - Q.115 : PLANT PHYSIOLOGY & CELL BIOLOGY) Tj ET
BT /F2 9 Tf 20 525 Td (Q.96: The enzyme nitrogenase responsible for atmospheric N2 fixation requires anaerobic conditions.) Tj ET
BT /F2 9 Tf 20 505 Td (Q.97: During cell division, crossing over between homologous chromosomes occurs in Pachytene stage.) Tj ET
BT /F2 9 Tf 20 485 Td (Q.98: Endosperm in angiosperms is typically triploid (3n) resulting from triple fusion.) Tj ET
BT /F2 9 Tf 20 465 Td (Q.99: Gaseous plant growth regulator promoting fruit ripening and leaf abscission is Ethylene.) Tj ET
BT /F2 9 Tf 20 445 Td (Q.100: Net gain of ATP molecules during glycolysis from one glucose molecule is 2 ATP.) Tj ET

BT /F1 10 Tf 20 405 Td (Q.116 - Q.135 : ECOLOGY & ENVIRONMENT) Tj ET
BT /F2 9 Tf 20 385 Td (Q.116: Pyramid of energy in any ecosystem is always upright and can never be inverted.) Tj ET
BT /F2 9 Tf 20 365 Td (Q.117: Montreal Protocol signed in 1987 aims to control substances that deplete ozone layer.) Tj ET
BT /F2 9 Tf 20 345 Td (Q.118: Lichens are symbiotic associations between algae and fungi and act as bio-indicators of SO2 pollution.) Tj ET
BT /F2 9 Tf 20 325 Td (Q.119: Biodiversity hotspots satisfy criteria of high species richness and high degree of endemism.) Tj ET
BT /F2 9 Tf 20 305 Td (Q.120: Biomagnification refers to increase in toxicant concentration at successive trophic levels.) Tj ET
Q
`);

  // Page 5: Zoology Q136 - Q180
  pages.push(`
q
0.6 0.25 0.15 rg 10 790 575 35 re f
1 1 1 rg BT /F1 14 Tf 20 802 Td (SECTION 4 : ZOOLOGY (QUESTIONS 136 - 180)) Tj ET
0 0 0 rg
BT /F1 10 Tf 20 760 Td (Q.136) Tj ET
BT /F2 9.5 Tf 55 760 Td (Which hormone directly induces LH surge causing ovulation in human females?) Tj ET
BT /F2 9 Tf 55 745 Td ((A) Luteinizing Hormone   (B) Progesterone          (C) Oxytocin              (D) Prolactin) Tj ET

BT /F1 10 Tf 20 720 Td (Q.137) Tj ET
BT /F2 9.5 Tf 55 720 Td (The basic functional and structural microscopic filtration unit of the human kidney is:) Tj ET
BT /F2 9 Tf 55 705 Td ((A) Neuron                (B) Alveolus              (C) Nephron               (D) Glomerulus) Tj ET

BT /F1 10 Tf 20 680 Td (Q.138) Tj ET
BT /F2 9.5 Tf 55 680 Td (Which blood group is designated as the universal donor in the ABO and Rh system?) Tj ET
BT /F2 9 Tf 55 665 Td ((A) AB positive           (B) O negative            (C) O positive            (D) AB negative) Tj ET

BT /F1 10 Tf 20 640 Td (Q.139) Tj ET
BT /F2 9.5 Tf 55 640 Td (During muscle contraction, calcium ions bind to which regulatory protein on actin filaments?) Tj ET
BT /F2 9 Tf 55 625 Td ((A) Tropomyosin           (B) Myosin head           (C) Actinin               (D) Troponin C) Tj ET

BT /F1 10 Tf 20 600 Td (Q.140) Tj ET
BT /F2 9.5 Tf 55 600 Td (The primary antibody present in colostrum providing passive immunity to infants is:) Tj ET
BT /F2 9 Tf 55 585 Td ((A) IgA                   (B) IgG                   (C) IgM                   (D) IgE) Tj ET

BT /F1 10 Tf 20 545 Td (Q.141 - Q.160 : HUMAN PHYSIOLOGY & REPRODUCTION) Tj ET
BT /F2 9 Tf 20 525 Td (Q.141: The pacemaking tissue of human heart initiating rhythmic cardiac contractions is SA node.) Tj ET
BT /F2 9 Tf 20 505 Td (Q.142: Tidal volume (TV) in a healthy human adult during normal quiet respiration is ~500 mL.) Tj ET
BT /F2 9 Tf 20 485 Td (Q.143: Corpus luteum secretes large amounts of Progesterone to maintain endometrium for pregnancy.) Tj ET
BT /F2 9 Tf 20 465 Td (Q.144: Sertoli cells located in seminiferous tubules provide nourishment to developing spermatids.) Tj ET
BT /F2 9 Tf 20 445 Td (Q.145: Juxtaglomerular apparatus (JGA) secretes Renin in response to fall in glomerular filtration rate.) Tj ET

BT /F1 10 Tf 20 405 Td (Q.161 - Q.180 : BIOTECHNOLOGY & EVOLUTION) Tj ET
BT /F2 9 Tf 20 385 Td (Q.161: Restriction endonucleases cleave phosphodiester bonds at specific palindromic sequences.) Tj ET
BT /F2 9 Tf 20 365 Td (Q.162: Taq polymerase used in PCR is isolated from the thermophilic bacterium Thermus aquaticus.) Tj ET
BT /F2 9 Tf 20 345 Td (Q.163: Homologous organs like forelimbs of cheetah and human indicate divergent evolution.) Tj ET
BT /F2 9 Tf 20 325 Td (Q.164: Hardy-Weinberg equilibrium equation states: p^2 + 2pq + q^2 = 1 in an undisturbed population.) Tj ET
BT /F2 9 Tf 20 305 Td (Q.165: Golden rice is genetically modified rice variety rich in beta-carotene (provitamin A).) Tj ET
BT /F1 11 Tf 220 250 Td (*** END OF QUESTION PAPER ***) Tj ET
Q
`);

  // Assemble valid PDF 1.4 objects
  let pdf = `%PDF-1.4\n`;
  const offsets: number[] = [];

  // Obj 1: Catalog
  offsets.push(pdf.length);
  pdf += `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;

  // Obj 2: Pages
  offsets.push(pdf.length);
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  pdf += `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`;

  // Obj 3: Font Resources
  offsets.push(pdf.length);
  pdf += `3 0 obj\n<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>\nendobj\n`;

  // Page objects and content objects
  for (let i = 0; i < pages.length; i++) {
    const pageObjNum = 4 + i * 2;
    const contentObjNum = 5 + i * 2;
    const contentStream = pages[i].trim();

    // Page object
    offsets.push(pdf.length);
    pdf += `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources 3 0 R /Contents ${contentObjNum} 0 R >>\nendobj\n`;

    // Content object
    offsets.push(pdf.length);
    pdf += `${contentObjNum} 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`;
  }

  // Cross reference table
  const startXref = pdf.length;
  pdf += `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }

  // Trailer
  pdf += `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;

  return new Blob([pdf], { type: 'application/pdf' });
}
