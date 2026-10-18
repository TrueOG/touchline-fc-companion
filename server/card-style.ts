// EA image-loading flags describe rendering, not the card edition.
export const cardStyleKey = (style: string) => [...new Set(style.split(/\s+/)
  .filter(token => token && token !== 'ut-item-loaded' && token !== 'ut-item-loading'))].sort().join(' ');
