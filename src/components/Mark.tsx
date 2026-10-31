// 产品标记：绿底圆角方块 + 中线（球网/球桌中线）+ 中心圆 —— 同时呼应羽毛球场与台球桌
export default function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6" fill="var(--color-accent)" />
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="var(--color-on-accent)" strokeWidth="1.4" opacity="0.9" />
      <line x1="1.5" y1="12" x2="22.5" y2="12" stroke="var(--color-on-accent)" strokeWidth="1.4" opacity="0.9" />
    </svg>
  );
}
