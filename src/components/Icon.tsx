// The July Oven 24px line-icon set (design-system/assets/Icons), plus a few
// app-only glyphs drawn to the same spec: 1.75 stroke, round caps and joins.
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'oven' | 'thermometer' | 'camera' | 'house' | 'wifi' | 'check-circle'
  | 'timer' | 'flame' | 'stop' | 'plus' | 'minus' | 'chevron-right' | 'chevron-left' | 'chevron-down' | 'chevron-up'
  | 'gear' | 'probe' | 'light' | 'link' | 'alert' | 'expand' | 'close' | 'download' | 'share'
  | 'history';

export function Icon({ name, size = 24, color }: { name: IconName; size?: number; color: string }) {
  const s = { stroke: color, strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {glyph(name, s, color)}
    </Svg>
  );
}

function glyph(name: IconName, s: object, color: string) {
  switch (name) {
    case 'oven':
      return (<>
        <Rect x={3.5} y={3.5} width={17} height={17} rx={2.5} {...s} />
        <Path d="M3.5 8.5h17M7 6h2M13 6h4" {...s} />
        <Rect x={7} y={11.5} width={10} height={6.5} rx={1.5} {...s} />
      </>);
    case 'thermometer':
      return (<>
        <Path d="M14 14.5V5a2.5 2.5 0 0 0-5 0v9.5a4 4 0 1 0 5 0Z" {...s} />
        <Circle cx={11.5} cy={16.5} r={1} fill={color} />
      </>);
    case 'camera':
      return (<>
        <Path d="M3.5 8.5a2 2 0 0 1 2-2h1.2l1.1-1.7a1 1 0 0 1 .84-.46h6.72a1 1 0 0 1 .84.46l1.1 1.7h1.2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" {...s} />
        <Circle cx={12} cy={12.5} r={3.5} {...s} />
      </>);
    case 'house':
      return <Path d="M4 10.5 12 4l8 6.5M5.5 9.5V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5M9.5 20v-5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v5" {...s} />;
    case 'wifi':
      return (<>
        <Path d="M5 10.5a11 11 0 0 1 14 0M7.5 13.5a7 7 0 0 1 9 0M10 16.5a3 3 0 0 1 4 0" {...s} />
        <Circle cx={12} cy={19.5} r={0.9} fill={color} />
      </>);
    case 'check-circle':
      return (<>
        <Circle cx={12} cy={12} r={8.5} {...s} />
        <Path d="m8.5 12 2.4 2.4 4.6-4.8" {...s} />
      </>);
    case 'timer':
      return (<>
        <Circle cx={12} cy={13.5} r={7} {...s} />
        <Path d="M12 13.5V10M10 3.5h4M18 7l1.2-1.2" {...s} />
      </>);
    case 'flame':
      return <Path d="M12 20.5c3.3 0 6-2.4 6-5.8 0-3.9-3.2-5.6-4-9.2-2.3 1.4-3.3 3.6-3.1 5.8-1-.5-1.7-1.4-2-2.5C7.4 10.3 6 12.4 6 14.7c0 3.4 2.7 5.8 6 5.8Z" {...s} />;
    case 'stop':
      return <Rect x={6.5} y={6.5} width={11} height={11} rx={2} {...s} />;
    case 'plus':
      return <Path d="M12 5.5v13M5.5 12h13" {...s} />;
    case 'minus':
      return <Path d="M5.5 12h13" {...s} />;
    case 'chevron-right':
      return <Path d="m9.5 6 6 6-6 6" {...s} />;
    case 'chevron-left':
      return <Path d="m14.5 6-6 6 6 6" {...s} />;
    case 'chevron-down':
      return <Path d="m6 9.5 6 6 6-6" {...s} />;
    case 'chevron-up':
      return <Path d="m6 14.5 6-6 6 6" {...s} />;
    case 'gear':
      // Drawn as sliders: reads as "settings" without looking like a sun.
      return (<>
        <Path d="M4 7.5h8.5M17.5 7.5H20M4 16.5h2.5M11.5 16.5H20" {...s} />
        <Circle cx={15} cy={7.5} r={2.5} {...s} />
        <Circle cx={9} cy={16.5} r={2.5} {...s} />
      </>);
    case 'probe':
      return (<>
        <Path d="M4 20 14.5 9.5" {...s} />
        <Path d="M13 8a3 3 0 1 1 3 3" {...s} />
        <Path d="M19 4.5c.8.8.8 2 0 2.8" {...s} />
      </>);
    case 'light':
      return <Path d="M9 18h6M10 21h4M12 3.5a5.5 5.5 0 0 0-3.3 9.9c.5.4.8 1 .8 1.6V15.5h5V15c0-.6.3-1.2.8-1.6A5.5 5.5 0 0 0 12 3.5Z" {...s} />;
    case 'link':
      return <Path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" {...s} />;
    case 'alert':
      return (<>
        <Path d="M10.3 4.6 3.4 17a2 2 0 0 0 1.7 3h13.8a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0Z" {...s} />
        <Path d="M12 9.5v4" {...s} />
        <Circle cx={12} cy={16.6} r={0.9} fill={color} />
      </>);
    case 'expand':
      return <Path d="M14.5 4.5h5v5M19.5 4.5 14 10M9.5 19.5h-5v-5M4.5 19.5 10 14" {...s} />;
    case 'close':
      return <Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" {...s} />;
    case 'download':
      return <Path d="M12 4.5v10.5M7.5 10.5 12 15l4.5-4.5M5 19.5h14" {...s} />;
    case 'share':
      return <Path d="M12 14.5V4.5M8 8.5l4-4 4 4M7.5 11.5H6a1.5 1.5 0 0 0-1.5 1.5v5.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V13a1.5 1.5 0 0 0-1.5-1.5h-1.5" {...s} />;
    case 'history':
      return (<>
        <Circle cx={5.5} cy={7} r={1.15} fill={color} />
        <Circle cx={5.5} cy={12} r={1.15} fill={color} />
        <Circle cx={5.5} cy={17} r={1.15} fill={color} />
        <Path d="M9 7h10.5M9 12h10.5M9 17h7" {...s} />
      </>);
  }
}

export function JulyMark({ size = 40, color }: { size?: number; color: string }) {
  return (
    // Same paths as website/public/assets/project-july-mark.svg.
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path
        fill={color}
        fillRule="evenodd"
        d="M11 12H53A7 7 0 0 1 60 19V41A7 7 0 0 1 53 48H11A7 7 0 0 1 4 41V19A7 7 0 0 1 11 12ZM13.25 16.5H50.75A1.25 1.25 0 0 1 52 17.75V17.75A1.25 1.25 0 0 1 50.75 19H13.25A1.25 1.25 0 0 1 12 17.75V17.75A1.25 1.25 0 0 1 13.25 16.5ZM13.5 23H50.5A3.5 3.5 0 0 1 54 26.5V39.5A3.5 3.5 0 0 1 50.5 43H13.5A3.5 3.5 0 0 1 10 39.5V26.5A3.5 3.5 0 0 1 13.5 23Z"
      />
      <Path
        fill={color}
        d="M46.25 28.5H50.25A1.25 1.25 0 0 1 51.5 29.75V39.25A1.25 1.25 0 0 1 50.25 40.5H46.25A1.25 1.25 0 0 1 45 39.25V29.75A1.25 1.25 0 0 1 46.25 28.5ZM10.5 48H16.5A1.5 1.5 0 0 1 18 49.5V50A1.5 1.5 0 0 1 16.5 51.5H10.5A1.5 1.5 0 0 1 9 50V49.5A1.5 1.5 0 0 1 10.5 48ZM47.5 48H53.5A1.5 1.5 0 0 1 55 49.5V50A1.5 1.5 0 0 1 53.5 51.5H47.5A1.5 1.5 0 0 1 46 50V49.5A1.5 1.5 0 0 1 47.5 48Z"
      />
    </Svg>
  );
}
