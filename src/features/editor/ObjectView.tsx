/** SVG rendering of editor objects (y-down page points), matching the export. */
import { memo } from 'react';
import { arrowHeadPath, arrowShaftEnd, pointsToSvgPath, signatureToPoints, type EditorObject } from '../../pdf/engines/annotations';
import { FONT_ASCENT, LINE_HEIGHT } from '../../pdf/winAnsi';
import { cssFont } from '../../utils/measureText';

export const ObjectView = memo(function ObjectView({ obj, assetUrl, hidden }: { obj: EditorObject; assetUrl?: string; hidden?: boolean }) {
  const opacity = obj.opacity ?? 1;
  const visibility = hidden ? 'hidden' : undefined;
  switch (obj.type) {
    case 'text':
      return (
        <g opacity={opacity} visibility={visibility} style={{ fontFamily: cssFont(obj.font), fontSize: obj.size, fontWeight: obj.bold ? 700 : 400, fontStyle: obj.italic ? 'italic' : 'normal', whiteSpace: 'pre' }} fill={obj.color}>
          {obj.text.split('\n').map((line, i) => (
            <text key={i} x={obj.x} y={obj.y + obj.size * FONT_ASCENT[obj.font] + i * obj.size * LINE_HEIGHT} textDecoration={obj.underline ? 'underline' : undefined}>
              {line}
            </text>
          ))}
        </g>
      );
    case 'draw':
      return <path d={pointsToSvgPath(obj.points)} fill="none" stroke={obj.color} strokeWidth={obj.width} strokeLinecap="round" strokeLinejoin="round" opacity={opacity} />;
    case 'signature':
      return (
        <g opacity={opacity} fill="none" stroke={obj.color} strokeWidth={Math.max(0.4, obj.h * obj.strokeRatio)} strokeLinecap="round" strokeLinejoin="round">
          {obj.strokes.map((s, i) => (
            <path key={i} d={pointsToSvgPath(signatureToPoints(obj, s))} />
          ))}
        </g>
      );
    case 'rect':
      return <rect x={obj.x} y={obj.y} width={obj.w} height={obj.h} fill={obj.fill ?? 'none'} stroke={obj.stroke ?? 'none'} strokeWidth={obj.stroke ? obj.strokeWidth : 0} opacity={opacity} />;
    case 'ellipse':
      return <ellipse cx={obj.x + obj.w / 2} cy={obj.y + obj.h / 2} rx={obj.w / 2} ry={obj.h / 2} fill={obj.fill ?? 'none'} stroke={obj.stroke ?? 'none'} strokeWidth={obj.stroke ? obj.strokeWidth : 0} opacity={opacity} />;
    case 'line':
    case 'arrow': {
      const [ex, ey] = obj.type === 'arrow' ? arrowShaftEnd(obj) : [obj.x2, obj.y2];
      return (
        <g opacity={opacity}>
          <line x1={obj.x1} y1={obj.y1} x2={ex} y2={ey} stroke={obj.color} strokeWidth={obj.width} strokeLinecap="round" />
          {obj.type === 'arrow' ? <path d={arrowHeadPath(obj)} fill={obj.color} /> : null}
        </g>
      );
    }
    case 'highlight':
      return <rect x={obj.x} y={obj.y} width={obj.w} height={obj.h} fill={obj.color} opacity={opacity} style={{ mixBlendMode: 'multiply' }} />;
    case 'image':
      return assetUrl ? <image href={assetUrl} x={obj.x} y={obj.y} width={obj.w} height={obj.h} opacity={opacity} preserveAspectRatio="none" /> : null;
  }
});
