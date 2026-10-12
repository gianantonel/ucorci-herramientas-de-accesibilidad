CREATE TABLE public.ucorci_users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, email text UNIQUE,
 "emailVerified" timestamptz, image text, "firstName" text, "lastName" text,
 "passwordHash" text, "createdAt" bigint NOT NULL,
 CHECK(email IS NULL OR length(email)<=254),
 CHECK("firstName" IS NULL OR length("firstName")<=80),
 CHECK("lastName" IS NULL OR length("lastName")<=80)
);
CREATE TABLE public.ucorci_accounts (
 "userId" uuid NOT NULL REFERENCES public.ucorci_users(id) ON DELETE CASCADE,
 type text NOT NULL, provider text NOT NULL, "providerAccountId" text NOT NULL,
 PRIMARY KEY(provider,"providerAccountId")
);
CREATE INDEX ucorci_account_owner ON public.ucorci_accounts("userId");
CREATE TABLE public.ucorci_usage_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.ucorci_users(id) ON DELETE CASCADE,
 tool text NOT NULL CHECK(tool IN ('tts','stt','dyslexia')),
 duration_ms bigint NOT NULL CHECK(duration_ms BETWEEN 0 AND 86400000),
 result text NOT NULL CHECK(result IN ('success','error')),
 created_at bigint NOT NULL
);
CREATE INDEX ucorci_usage_owner ON public.ucorci_usage_events(user_id,created_at);
CREATE INDEX ucorci_usage_tool ON public.ucorci_usage_events(tool,created_at);
CREATE TABLE public.ucorci_rate_limits (key text PRIMARY KEY,count integer NOT NULL,expires bigint NOT NULL);

-- Auth.js performs authorization on the Vercel server. No direct browser data access.
ALTER TABLE public.ucorci_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ucorci_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ucorci_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ucorci_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ucorci_users,public.ucorci_accounts,public.ucorci_usage_events,public.ucorci_rate_limits FROM anon,authenticated;
GRANT ALL ON public.ucorci_users,public.ucorci_accounts,public.ucorci_usage_events,public.ucorci_rate_limits TO project_admin;

CREATE FUNCTION public.ucorci_rate_limit(p_key text,p_max integer,p_window bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE now_ms bigint; requests integer;
BEGIN
 IF p_max<1 OR p_window<1000 OR p_window>86400000 OR length(p_key)>200 THEN
  RAISE EXCEPTION 'Invalid rate limit';
 END IF;
 now_ms := floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 INSERT INTO public.ucorci_rate_limits(key,count,expires) VALUES(p_key,1,now_ms+p_window)
 ON CONFLICT(key) DO UPDATE SET
 count=CASE WHEN ucorci_rate_limits.expires<now_ms THEN 1 ELSE ucorci_rate_limits.count+1 END,
 expires=CASE WHEN ucorci_rate_limits.expires<now_ms THEN now_ms+p_window ELSE ucorci_rate_limits.expires END
 RETURNING count INTO requests;
 RETURN requests>p_max;
END;
$$;
REVOKE ALL ON FUNCTION public.ucorci_rate_limit(text,integer,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ucorci_rate_limit(text,integer,bigint) TO project_admin;

CREATE FUNCTION public.ucorci_usage_summary()
RETURNS TABLE(tool text,usos bigint,personas bigint,tiempo_promedio_ms numeric,errores bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT tool,count(*),count(DISTINCT user_id),round(avg(duration_ms)),count(*) FILTER(WHERE result='error')
 FROM public.ucorci_usage_events GROUP BY tool;
$$;
REVOKE ALL ON FUNCTION public.ucorci_usage_summary() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ucorci_usage_summary() TO project_admin;
