const SIZES = {
  md: 'min-h-11 px-3.5 text-[14px]',
  sm: 'min-h-9 px-3 text-[13px]',
  wide: 'min-h-11 px-[22px] text-[14px]',
  icon: 'min-h-11 w-11 p-0 justify-center text-[14px]',
};

/** The Tailwind classes for a button: `primary` is the filled accent button, for the one main action. */
export function buttonClass({ primary = false, size = 'md' }: { primary?: boolean; size?: keyof typeof SIZES } = {}) {
  const look = primary
    ? 'border-accent bg-accent font-semibold text-on-accent disabled:cursor-not-allowed disabled:border-rule disabled:bg-sunk disabled:text-ink3'
    : 'border-rule2 bg-transparent font-normal text-ink hover:bg-sunk';
  return `inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-[10px] border leading-[normal] ${SIZES[size]} ${look}`;
}
