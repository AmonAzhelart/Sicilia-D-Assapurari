import type { CSSProperties } from 'react';
import type { IconDefinition } from '@fortawesome/fontawesome-common-types';

// Icone Font Awesome come SVG inline: niente CSS/font esterni bloccanti, solo le icone usate finiscono nel bundle.
export function Icon({ icon, style }: { icon: IconDefinition; style?: CSSProperties }) {
  const [width, height, , , path] = icon.icon;
  return (
    <svg className="icon" viewBox={`0 0 ${width} ${height}`} style={{ width: `${width / height}em`, ...style }}
      aria-hidden="true" focusable="false">
      <path fill="currentColor" d={Array.isArray(path) ? path.join(' ') : path} />
    </svg>
  );
}
