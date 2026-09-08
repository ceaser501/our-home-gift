import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "@/lib/utils";

function Label({ className, ...props }) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        // text-sm(14)에서 text-body 로. 값은 같고 이름만 스케일로 옮긴다 — 임의값과
        // Tailwind 기본을 걷어내는 중이고, 이 부품은 앱 열여섯 곳에 걸린다.
        //
        // leading-none 은 그대로 둔다. 줄 상자가 글자 높이와 같아서 아래 칸과의
        // 간격에 반행간이 안 얹힌다 — 적은 값이 그대로 보이는 틈이 된다.
        "flex items-center gap-2 text-body leading-none font-medium select-none",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
