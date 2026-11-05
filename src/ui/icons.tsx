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
export const IconEdit = svg('M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4');
export const IconGear = svg('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z');
export const IconInfo = svg('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.5');
export const IconCollapse = svg('M6 15l6-6 6 6');
export const IconExpand = svg('M6 9l6 6 6-6');
export const IconNote = svg('M5 3h14v11l-7 7H5zM12 21v-7h7M9 8h6M9 12h3');
export const IconMic = svg('M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3');
export const IconGuitar = svg('M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z');
export const IconEyeOff = svg('M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3 3.7M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2');
export const IconPlay = svg('M7 4.5v15l12-7.5z');
export const IconDownload = svg('M12 4v11M7 10l5 5 5-5M5 20h14');
