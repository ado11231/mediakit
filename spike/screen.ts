import { h, type Element } from './h.ts';
import { palette, font } from './palette.ts';

interface Row {
  title: string;
  meta: string;
  value: string;
  highlight?: boolean;
}

/**
 * Sample data only. Nothing here names a domain concept, per CLAUDE.md invariant 6:
 * the spike is public and a built-in must not learn one app's vocabulary.
 */
const rows: Row[] = [
  { title: 'Northgate Retail', meta: 'Replied 2m ago', value: '$4,200', highlight: true },
  { title: 'Halverson Group', meta: 'Awaiting quote', value: '$1,850' },
  { title: 'Pinecrest Ltd', meta: 'Scheduled Thu', value: '$980' },
  { title: 'Ardmore Studio', meta: 'New enquiry', value: '$2,400' },
];

const statusChip = (label: string): Element =>
  h(
    'div',
    {
      display: 'flex',
      alignSelf: 'flex-start',
      // 'inline-flex' is not in satori's display set (CLAUDE.md), so hugging content
      // is flex plus alignSelf.
      paddingTop: 5,
      paddingBottom: 5,
      paddingLeft: 12,
      paddingRight: 12,
      borderRadius: 999,
      backgroundColor: palette.accentSoft,
      color: palette.accent,
      fontFamily: font.body,
      fontSize: 13,
      fontWeight: 600,
      letterSpacing: 0.2,
    },
    label,
  );

const listRow = ({ title, meta, value, highlight }: Row): Element =>
  h(
    'div',
    {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      borderRadius: 16,
      backgroundColor: highlight ? palette.accentSoft : palette.surface,
    },
    h(
      'div',
      { display: 'flex', flexDirection: 'column', gap: 4 },
      h(
        'div',
        { fontFamily: font.body, fontSize: 16, fontWeight: 600, color: palette.ink },
        title,
      ),
      h('div', { fontFamily: font.body, fontSize: 13, color: palette.inkMuted }, meta),
    ),
    h(
      'div',
      {
        fontFamily: font.body,
        fontSize: 16,
        fontWeight: 600,
        color: highlight ? palette.positive : palette.ink,
      },
      value,
    ),
  );

export const ListScreen = (notchClearance: number): Element =>
  h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      // Content starts below the notch rather than under it. The reference render
      // clipped its screen content here (roadmap.md:120), which is the one visible
      // defect worth not reproducing.
      paddingTop: notchClearance + 20,
      paddingLeft: 20,
      paddingRight: 20,
      paddingBottom: 20,
      gap: 12,
    },
    h(
      'div',
      { display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 4 },
      statusChip('THIS WEEK'),
      h(
        'div',
        { fontFamily: font.body, fontSize: 26, fontWeight: 700, color: palette.ink },
        '9 open threads',
      ),
    ),
    ...rows.map(listRow),
  );
