"use client";

import { useState } from "react";
import { isReferenceImage } from "@/lib/exam-material-files";
import type { ExamMaterial } from "@/lib/dashboard/types";

export function ReferenceMaterialContent({ material, url }: { material: ExamMaterial; url: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!isReferenceImage(material.storage_path)) {
    return <iframe title={material.name} src={`${url}#view=FitH`} className="min-h-0 w-full flex-1 border-0" />;
  }
  return <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-2">
    {failedUrl === url
      ? <p role="alert" className="p-3 text-sm text-red-800">Unable to display this image. Please check your connection or reopen the reference material.</p>
      // Signed private Storage URLs renew independently of the Next.js image cache.
      // eslint-disable-next-line @next/next/no-img-element
      : <img src={url} alt={material.name} className="mx-auto h-auto max-w-full" onError={() => setFailedUrl(url)} />}
    <a href={url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-blue-800 underline">Open original image</a>
  </div>;
}
