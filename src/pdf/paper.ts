/** Standard paper sizes in PDF points (portrait). Pure module. */
export const PAPER_SIZES = {
  a3: { label: 'A3', width: 841.89, height: 1190.55 },
  a4: { label: 'A4', width: 595.28, height: 841.89 },
  a5: { label: 'A5', width: 419.53, height: 595.28 },
  letter: { label: 'US Letter', width: 612, height: 792 },
  legal: { label: 'US Legal', width: 612, height: 1008 },
} as const;
export type PaperSize = keyof typeof PAPER_SIZES;

export const MM_TO_PT = 72 / 25.4;
export const IN_TO_PT = 72;
