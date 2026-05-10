import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCronReport } from "./handler.ts";

Deno.serve(handleCronReport);
