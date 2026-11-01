type P = { size?: number };
const svg = (d: string) => ({ size = 32 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={d} /></svg>
);

export const IconPrev = svg('M15 4 7 12l8 8');
export const IconNext = svg('M9 4l8 8-8 8');
export const IconBack = svg('M19 12H5M11 5l-7 7 7 7');
export const IconHome = svg('M3 11 12 3l9 8M5 9.5V21h5v-6h4v6h5V9.5');
export const IconSearch = svg('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5');
export const IconClose = svg('M6 6l12 12M18 6 6 18');
export const IconChevron = svg('M9 6l6 6-6 6');
export const IconSun = svg('M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4');
export const IconMoon = svg('M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z');
