"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
export function useExamMaterialUrl(storagePath?: string, open = false) {
    const [state, setState] = useState<{
        path?: string;
        url: string | null;
        error: string | null;
    }>({ url: null, error: null });
    useEffect(() => {
        if (!storagePath || !open)
            return;
        let cancelled = false;
        async function renew() {
            try {
                const { data, error } = await createClient().storage.from("exam-materials").createSignedUrl(storagePath!, 3600);
                if (!cancelled)
                    setState({ path: storagePath, url: data?.signedUrl ?? null, error: error?.message ?? null });
            }
            catch (error) {
                if (!cancelled)
                    setState({ path: storagePath, url: null, error: error instanceof Error ? error.message : "Unable to load the document. Please reconnect." });
            }
        }
        void renew();
        const interval = window.setInterval(() => void renew(), 15 * 60 * 1000);
        return () => { cancelled = true; window.clearInterval(interval); };
    }, [storagePath, open]);
    return state.path === storagePath ? state : { url: null, error: null };
}
