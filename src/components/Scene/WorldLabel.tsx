import { Text, type TextProps } from '@react-three/drei';
import { WORLD_LABEL_FONT, WORLD_LABEL_PRELOAD, offlineWorldLabel } from '../../lib/worldLabelFont';

type WorldLabelProps = Omit<TextProps, 'font' | 'characters' | 'children'> & { children: string };

export function WorldLabel({ children, ...appearance }: WorldLabelProps) {
  return <Text {...appearance} font={WORLD_LABEL_FONT} characters={WORLD_LABEL_PRELOAD}>
    {offlineWorldLabel(children)}
  </Text>;
}
