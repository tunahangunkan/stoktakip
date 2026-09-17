// ============================================================
//  KANAL KAYDI — kanal adından connector'a erişim
// ============================================================
import { ChannelConnector } from './types';
import { ikasConnector } from './ikas';
import { trendyolConnector } from './trendyol';
import { hbConnector } from './hb';

export const connectors: Record<'ikas' | 'trendyol' | 'hb', ChannelConnector> = {
  ikas: ikasConnector,
  trendyol: trendyolConnector,
  hb: hbConnector,
};

export * from './types';
