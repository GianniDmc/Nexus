create extension if not exists "pg_cron" with schema "pg_catalog";

drop extension if exists "pg_net";

create extension if not exists "pg_net" with schema "public";


  create table "public"."app_state" (
    "key" text not null,
    "value" jsonb not null,
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."articles" alter column "embedding" set data type public.vector(768) using "embedding"::public.vector(768);

alter table "public"."clusters" alter column "published_on" set data type timestamp with time zone using "published_on"::timestamp with time zone;

CREATE UNIQUE INDEX app_state_pkey ON public.app_state USING btree (key);

CREATE UNIQUE INDEX articles_source_url_unique ON public.articles USING btree (source_url);

alter table "public"."app_state" add constraint "app_state_pkey" PRIMARY KEY using index "app_state_pkey";

alter table "public"."articles" add constraint "articles_source_url_unique" UNIQUE using index "articles_source_url_unique";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_cluster_article_counts()
 RETURNS TABLE(cluster_id uuid, article_count bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    a.cluster_id,
    COUNT(*)::bigint as article_count
  FROM articles a
  WHERE a.cluster_id IS NOT NULL
  GROUP BY a.cluster_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_multi_article_clusters()
 RETURNS TABLE(id uuid, label text, is_published boolean, final_score double precision, created_at timestamp with time zone, article_count bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH cluster_counts AS (
    SELECT 
      a.cluster_id,
      COUNT(*)::bigint as cnt
    FROM articles a
    WHERE a.cluster_id IS NOT NULL
    GROUP BY a.cluster_id
    HAVING COUNT(*) > 1
  )
  SELECT 
    c.id,
    c.label,
    c.is_published,
    c.final_score,
    c.created_at,
    cc.cnt as article_count
  FROM clusters c
  INNER JOIN cluster_counts cc ON c.id = cc.cluster_id
  ORDER BY cc.cnt DESC, c.created_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_pipeline_stats()
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total', (SELECT COUNT(*) FROM articles),
    'pendingEmbedding', (SELECT COUNT(*) FROM articles WHERE embedding IS NULL),
    'embedded', (SELECT COUNT(*) FROM articles WHERE embedding IS NOT NULL),
    'pendingClustering', (SELECT COUNT(*) FROM articles WHERE embedding IS NOT NULL AND cluster_id IS NULL),
    'clustered', (SELECT COUNT(*) FROM articles WHERE cluster_id IS NOT NULL),
    'pendingScoring', (SELECT COUNT(*) FROM articles WHERE cluster_id IS NOT NULL AND relevance_score IS NULL),
    'scored', (SELECT COUNT(*) FROM articles WHERE relevance_score IS NOT NULL),
    'relevant', (SELECT COUNT(*) FROM articles WHERE final_score >= 5.5),
    'rejected', (SELECT COUNT(*) FROM articles WHERE final_score IS NOT NULL AND final_score < 5.5),
    'ready', (SELECT COUNT(*) FROM articles WHERE summary_short IS NOT NULL AND is_published = false AND final_score >= 5.5),
    'published', (SELECT COUNT(*) FROM articles WHERE is_published = true),
    'clusterCount', (SELECT COUNT(*) FROM clusters),
    'multiArticleClusters', (
      SELECT COUNT(*) FROM (
        SELECT cluster_id FROM articles WHERE cluster_id IS NOT NULL GROUP BY cluster_id HAVING COUNT(*) > 1
      ) sub
    )
  ) INTO result;
  
  RETURN result;
END;
$function$
;

grant delete on table "public"."app_state" to "anon";

grant insert on table "public"."app_state" to "anon";

grant references on table "public"."app_state" to "anon";

grant select on table "public"."app_state" to "anon";

grant trigger on table "public"."app_state" to "anon";

grant truncate on table "public"."app_state" to "anon";

grant update on table "public"."app_state" to "anon";

grant delete on table "public"."app_state" to "authenticated";

grant insert on table "public"."app_state" to "authenticated";

grant references on table "public"."app_state" to "authenticated";

grant select on table "public"."app_state" to "authenticated";

grant trigger on table "public"."app_state" to "authenticated";

grant truncate on table "public"."app_state" to "authenticated";

grant update on table "public"."app_state" to "authenticated";

grant delete on table "public"."app_state" to "service_role";

grant insert on table "public"."app_state" to "service_role";

grant references on table "public"."app_state" to "service_role";

grant select on table "public"."app_state" to "service_role";

grant trigger on table "public"."app_state" to "service_role";

grant truncate on table "public"."app_state" to "service_role";

grant update on table "public"."app_state" to "service_role";


