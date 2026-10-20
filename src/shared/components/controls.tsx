import type { ComponentPropsWithRef, ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

import { Button } from "./Button";

export function IconButton({
  icon,
  title,
  active = false,
  className = "",
  ...props
}: Omit<ComponentPropsWithRef<"button">, "children"> & {
  icon: IconName;
  title: string;
  active?: boolean;
}) {
  return (
    <Button
      {...props}
      variant="bare"
      className={`icon-button ${active ? "active" : ""} w-[32px] h-[32px] flex items-center justify-center rounded-[6px] text-[#798273] shrink-0 enabled:hover:bg-[#edf1e6] [&.active]:bg-[#e7eddf] [&.active]:text-[#37533a] ${className}`}
      aria-label={props["aria-label"] ?? title}
      title={title}
    >
      <Icon name={icon} />
    </Button>
  );
}
export function Section({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="panel-section py-[22px] px-[20px] border-b [border-bottom-style:solid] border-b-[var(--border)] last:[border-bottom:0]
      wide:p-[25px] laptop:py-[20px] laptop:px-[16px] tablet:py-[18px] tablet:px-[14px]"
    >
      <div
        className={`section-heading flex items-center justify-between ${children ? "mb-[19px]" : ""} gap-[8px]
        [&_h3]:font-semibold [&_h3]:m-0 [&_h3]:tracking-[0.5px]`}
      >
        <h3>{title}</h3>
        {trailing}
      </div>
      {children}
    </section>
  );
}
