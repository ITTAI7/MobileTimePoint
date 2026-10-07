/**
 * 每個孩子一套配色，切換時一眼看得出畫面換了人：上方分頁、積分大卡片、本週紀錄、
 * 家長區選孩子的卡片都用同一套。加分綠、扣分紅、兌換紫是「意思」不是「人」，不跟著換。
 *
 * 色票來自 parseCleanUsers 指派的 avatarColor（依使用者表的順序輪流）。
 * Tailwind 需要完整的類別字串才掃得到，所以不能用字串拼接。
 *
 * 哥哥是海洋藍、妹妹是 Tiffany 綠（自訂色，定義在 index.css），都走明亮通透的調子。
 * 鍵名沿用 blue / emerald：手機快取的使用者資料裡存的是這兩個名字，改名會讓快取畫出錯的顏色。
 */
export interface ChildTheme {
  /** 漸層：積分大卡片、紀錄標題的小圖示、家長區選中的卡片 */
  hero: string;
  shadow: string;
  /** 在孩子分頁時整頁的底色 */
  page: string;
  /** 主色文字：分頁名稱、紀錄標題、日期 */
  text: string;
  /** 實心主色：頭像圓點、「今天」標籤、選中的篩選 */
  avatar: string;
  /** 淡底色：家長區沒選中卡片上的點數 */
  soft: string;
  /** 淡框線：每一天的卡片、日期標題底線、篩選列 */
  line: string;
  /** 深一點的框線：家長區沒選中的卡片 */
  lineStrong: string;
  /** 「今天」那一天的外框 */
  ring: string;
  /** 同一天裡紀錄之間的分隔線 */
  divide: string;
  /** 家長解鎖時按住紀錄的回饋 */
  press: string;
  hover: string;
}

const CHILD_THEMES: Record<string, ChildTheme> = {
  // 海洋藍：淺海的天藍漸層到深海的藍
  blue: {
    hero: 'from-sky-400 via-sky-500 to-blue-600',
    shadow: 'shadow-sky-500/30',
    page: 'bg-sky-50',
    text: 'text-sky-700',
    avatar: 'bg-sky-500',
    soft: 'bg-sky-50',
    line: 'border-sky-100',
    lineStrong: 'border-sky-200',
    ring: 'ring-sky-300',
    divide: 'divide-sky-100',
    press: 'active:bg-sky-100/60',
    hover: 'hover:bg-sky-50',
  },
  // Tiffany 綠
  emerald: {
    hero: 'from-tiffany-400 via-tiffany-500 to-tiffany-600',
    shadow: 'shadow-tiffany-500/30',
    page: 'bg-tiffany-50',
    text: 'text-tiffany-700',
    avatar: 'bg-tiffany-500',
    soft: 'bg-tiffany-50',
    line: 'border-tiffany-100',
    lineStrong: 'border-tiffany-200',
    ring: 'ring-tiffany-300',
    divide: 'divide-tiffany-100',
    press: 'active:bg-tiffany-100/60',
    hover: 'hover:bg-tiffany-50',
  },
  amber: {
    hero: 'from-amber-500 via-orange-500 to-rose-500',
    shadow: 'shadow-amber-500/25',
    page: 'bg-amber-50',
    text: 'text-amber-700',
    avatar: 'bg-amber-500',
    soft: 'bg-amber-50',
    line: 'border-amber-100',
    lineStrong: 'border-amber-200',
    ring: 'ring-amber-300',
    divide: 'divide-amber-100',
    press: 'active:bg-amber-100/60',
    hover: 'hover:bg-amber-50',
  },
  purple: {
    hero: 'from-purple-600 via-fuchsia-600 to-pink-600',
    shadow: 'shadow-purple-500/25',
    page: 'bg-purple-50',
    text: 'text-purple-700',
    avatar: 'bg-purple-600',
    soft: 'bg-purple-50',
    line: 'border-purple-100',
    lineStrong: 'border-purple-200',
    ring: 'ring-purple-300',
    divide: 'divide-purple-100',
    press: 'active:bg-purple-100/60',
    hover: 'hover:bg-purple-50',
  },
  rose: {
    hero: 'from-rose-500 via-pink-600 to-fuchsia-700',
    shadow: 'shadow-rose-500/25',
    page: 'bg-rose-50',
    text: 'text-rose-700',
    avatar: 'bg-rose-600',
    soft: 'bg-rose-50',
    line: 'border-rose-100',
    lineStrong: 'border-rose-200',
    ring: 'ring-rose-300',
    divide: 'divide-rose-100',
    press: 'active:bg-rose-100/60',
    hover: 'hover:bg-rose-50',
  },
};

export function themeOf(user?: { avatarColor?: string }): ChildTheme {
  return CHILD_THEMES[user?.avatarColor || 'blue'] || CHILD_THEMES.blue;
}
