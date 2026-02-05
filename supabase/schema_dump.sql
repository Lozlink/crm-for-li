SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."accept_invitation"("p_invite_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
declare
    v_invitation record;
    v_existing record;
    v_membership_id uuid;
begin
    -- Find the invitation
    select * into v_invitation
    from invitations
    where invite_code = p_invite_code
      and accepted_at is null
      and expires_at > now();

    if not found then
        return jsonb_build_object('success', false, 'error', 'Invalid or expired invitation');
    end if;

    -- Check if already a member
    select * into v_existing
    from memberships
    where user_id = auth.uid()
      and team_id = v_invitation.team_id;

    if found then
        return jsonb_build_object('success', false, 'error', 'Already a member of this team');
    end if;

    -- Create membership
    insert into memberships (user_id, team_id, role, status, invited_by, joined_at)
    values (auth.uid(), v_invitation.team_id, v_invitation.role, 'active', v_invitation.invited_by, now())
    returning id into v_membership_id;

    -- Mark invitation as accepted
    update invitations
    set accepted_at = now()
    where id = v_invitation.id;

    -- Set as active team if user has no active team
    update user_profiles
    set active_team_id = v_invitation.team_id
    where id = auth.uid()
      and active_team_id is null;

    return jsonb_build_object(
            'success', true,
            'membership_id', v_membership_id,
            'team_id', v_invitation.team_id
           );
end;
$$;


ALTER FUNCTION "public"."accept_invitation"("p_invite_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_team_ids"("uid" "uuid") RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
AS $$
SELECT team_id FROM public.memberships
WHERE user_id = uid
  AND status = 'active';
$$;


ALTER FUNCTION "public"."get_user_team_ids"("uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.user_profiles (id, display_name)
    VALUES (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email));
    RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
AS $$
begin
    new.updated_at = now();
    return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activities" (
                                                     "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
                                                     "contact_id" "uuid" NOT NULL,
                                                     "type" "text" NOT NULL,
                                                     "content" "text",
                                                     "user_id" "uuid",
                                                     "created_at" timestamp with time zone DEFAULT "now"(),
                                                     "team_id" "uuid",
                                                     CONSTRAINT "activities_type_check" CHECK (("type" = ANY (ARRAY['note'::"text", 'call'::"text", 'meeting'::"text", 'email'::"text"])))
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
                                                   "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
                                                   "first_name" "text" NOT NULL,
                                                   "last_name" "text",
                                                   "email" "text",
                                                   "phone" "text",
                                                   "address" "text",
                                                   "latitude" double precision,
                                                   "longitude" double precision,
                                                   "tag_id" "uuid",
                                                   "user_id" "uuid",
                                                   "created_at" timestamp with time zone DEFAULT "now"(),
                                                   "updated_at" timestamp with time zone DEFAULT "now"(),
                                                   "team_id" "uuid"
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invitations" (
                                                      "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
                                                      "team_id" "uuid" NOT NULL,
                                                      "email" "text",
                                                      "invite_code" "text" NOT NULL,
                                                      "role" "text" DEFAULT 'member'::"text" NOT NULL,
                                                      "invited_by" "uuid" NOT NULL,
                                                      "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
                                                      "accepted_at" timestamp with time zone,
                                                      "created_at" timestamp with time zone DEFAULT "now"(),
                                                      CONSTRAINT "invitations_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'member'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memberships" (
                                                      "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
                                                      "user_id" "uuid" NOT NULL,
                                                      "team_id" "uuid" NOT NULL,
                                                      "role" "text" DEFAULT 'member'::"text" NOT NULL,
                                                      "status" "text" DEFAULT 'active'::"text" NOT NULL,
                                                      "invited_by" "uuid",
                                                      "joined_at" timestamp with time zone,
                                                      "created_at" timestamp with time zone DEFAULT "now"(),
                                                      "updated_at" timestamp with time zone DEFAULT "now"(),
                                                      CONSTRAINT "memberships_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text", 'viewer'::"text"]))),
                                                      CONSTRAINT "memberships_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'invited'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tags" (
                                               "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
                                               "name" "text" NOT NULL,
                                               "color" "text" NOT NULL,
                                               "user_id" "uuid",
                                               "created_at" timestamp with time zone DEFAULT "now"(),
                                               "team_id" "uuid"
);


ALTER TABLE "public"."tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
                                                "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
                                                "name" "text" NOT NULL,
                                                "slug" "text" NOT NULL,
                                                "owner_id" "uuid",
                                                "avatar_url" "text",
                                                "settings" "jsonb" DEFAULT '{}'::"jsonb",
                                                "plan" "text" DEFAULT 'free'::"text" NOT NULL,
                                                "status" "text" DEFAULT 'active'::"text" NOT NULL,
                                                "created_at" timestamp with time zone DEFAULT "now"(),
                                                "updated_at" timestamp with time zone DEFAULT "now"(),
                                                CONSTRAINT "teams_plan_check" CHECK (("plan" = ANY (ARRAY['free'::"text", 'pro'::"text", 'team'::"text"]))),
                                                CONSTRAINT "teams_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
                                                        "id" "uuid" NOT NULL,
                                                        "display_name" "text",
                                                        "avatar_url" "text",
                                                        "active_team_id" "uuid",
                                                        "created_at" timestamp with time zone DEFAULT "now"(),
                                                        "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_user_id_team_id_key" UNIQUE ("user_id", "team_id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



CREATE INDEX "activities_contact_id_idx" ON "public"."activities" USING "btree" ("contact_id");



CREATE INDEX "activities_team_id_idx" ON "public"."activities" USING "btree" ("team_id");



CREATE INDEX "contacts_location_idx" ON "public"."contacts" USING "btree" ("latitude", "longitude");



CREATE INDEX "contacts_tag_id_idx" ON "public"."contacts" USING "btree" ("tag_id");



CREATE INDEX "contacts_team_id_idx" ON "public"."contacts" USING "btree" ("team_id");



CREATE INDEX "contacts_user_id_idx" ON "public"."contacts" USING "btree" ("user_id");



CREATE INDEX "invitations_invite_code_idx" ON "public"."invitations" USING "btree" ("invite_code");



CREATE INDEX "invitations_team_id_idx" ON "public"."invitations" USING "btree" ("team_id");



CREATE INDEX "memberships_team_id_idx" ON "public"."memberships" USING "btree" ("team_id");



CREATE INDEX "memberships_user_id_idx" ON "public"."memberships" USING "btree" ("user_id");



CREATE INDEX "tags_team_id_idx" ON "public"."tags" USING "btree" ("team_id");



CREATE INDEX "tags_user_id_idx" ON "public"."tags" USING "btree" ("user_id");



CREATE INDEX "teams_slug_idx" ON "public"."teams" USING "btree" ("slug");



CREATE OR REPLACE TRIGGER "update_contacts_updated_at" BEFORE UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_memberships_updated_at" BEFORE UPDATE ON "public"."memberships" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_teams_updated_at" BEFORE UPDATE ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_profiles_updated_at" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_active_team_id_fkey" FOREIGN KEY ("active_team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Authenticated users can create teams" ON "public"."teams" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Team admins can create invitations" ON "public"."invitations" FOR INSERT WITH CHECK (("team_id" IN ( SELECT "memberships"."team_id"
                                                                                                                    FROM "public"."memberships"
                                                                                                                    WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."status" = 'active'::"text") AND ("memberships"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Team admins can delete invitations" ON "public"."invitations" FOR DELETE USING (("team_id" IN ( SELECT "memberships"."team_id"
                                                                                                               FROM "public"."memberships"
                                                                                                               WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."status" = 'active'::"text") AND ("memberships"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Team admins can manage memberships" ON "public"."memberships" FOR INSERT WITH CHECK ((("team_id" IN ( SELECT "m"."team_id"
                                                                                                                     FROM "public"."memberships" "m"
                                                                                                                     WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."status" = 'active'::"text") AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "Team admins can remove members" ON "public"."memberships" FOR DELETE USING ((("team_id" IN ( SELECT "m"."team_id"
                                                                                                            FROM "public"."memberships" "m"
                                                                                                            WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."status" = 'active'::"text") AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "Team admins can update memberships" ON "public"."memberships" FOR UPDATE USING (("team_id" IN ( SELECT "m"."team_id"
                                                                                                               FROM "public"."memberships" "m"
                                                                                                               WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."status" = 'active'::"text") AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Team admins can view invitations" ON "public"."invitations" FOR SELECT USING (("team_id" IN ( SELECT "memberships"."team_id"
                                                                                                             FROM "public"."memberships"
                                                                                                             WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."status" = 'active'::"text") AND ("memberships"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Team members can create activities" ON "public"."activities" FOR INSERT WITH CHECK (("team_id" IN ( SELECT "public"."get_user_team_ids"("auth"."uid"()) AS "get_user_team_ids")));



CREATE POLICY "Team members can create contacts" ON "public"."contacts" FOR INSERT WITH CHECK (("team_id" IN ( SELECT "public"."get_user_team_ids"("auth"."uid"()) AS "get_user_team_ids")));



CREATE POLICY "Team members can create tags" ON "public"."tags" FOR INSERT WITH CHECK (("team_id" IN ( SELECT "public"."get_user_team_ids"("auth"."uid"()) AS "get_user_team_ids")));



CREATE POLICY "Team members can delete tags" ON "public"."tags" FOR DELETE USING ((("team_id" IN ( SELECT "public"."get_user_team_ids"("auth"."uid"()) AS "get_user_team_ids")) OR (("team_id" IS NULL) AND ("user_id" = "auth"."uid"()))));



CREATE POLICY "Team members can update activities" ON "public"."activities" FOR UPDATE USING ((("team_id" IN ( SELECT "public"."get_user_team_ids"("auth"."uid"()) AS "get_user_team_ids")) OR (("team_id" IS NULL) AND ("user_id" = "auth"."uid"()))));



CREATE POLICY "Team members can update contacts" ON "public"."contacts" FOR UPDATE USING ((("team_id" IN ( SELECT "public"."get_user_team_ids"("auth"."uid"()) AS "get_user_team_ids")) OR (("team_id" IS NULL) AND ("user_id" = "auth"."uid"()))));



CREATE POLICY "Team members can update tags" ON "public"."tags" FOR UPDATE USING ((("team_id" IN ( SELECT "public"."get_user_team_ids"("auth"."uid"()) AS "get_user_team_ids")) OR (("team_id" IS NULL) AND ("user_id" = "auth"."uid"()))));



CREATE POLICY "Team members can view activities" ON "public"."activities" FOR SELECT USING ((("team_id" IN ( SELECT "public"."get_user_team_ids"("auth"."uid"()) AS "get_user_team_ids")) OR (("team_id" IS NULL) AND ("user_id" = "auth"."uid"()))));



CREATE POLICY "Team members can view contacts" ON "public"."contacts" FOR SELECT USING ((("team_id" IN ( SELECT "public"."get_user_team_ids"("auth"."uid"()) AS "get_user_team_ids")) OR (("team_id" IS NULL) AND ("user_id" = "auth"."uid"()))));



CREATE POLICY "Team members can view memberships" ON "public"."memberships" FOR SELECT USING (("team_id" IN ( SELECT "public"."get_user_team_ids"("auth"."uid"()) AS "get_user_team_ids")));



CREATE POLICY "Team members can view tags" ON "public"."tags" FOR SELECT USING ((("team_id" IN ( SELECT "public"."get_user_team_ids"("auth"."uid"()) AS "get_user_team_ids")) OR (("team_id" IS NULL) AND ("user_id" = "auth"."uid"()))));



CREATE POLICY "Team members can view their teams" ON "public"."teams" FOR SELECT USING ((("owner_id" = "auth"."uid"()) OR ("id" IN ( SELECT "public"."get_user_team_ids"("auth"."uid"()) AS "get_user_team_ids"))));



CREATE POLICY "Team non-viewers can delete activities" ON "public"."activities" FOR DELETE USING (("team_id" IN ( SELECT "memberships"."team_id"
                                                                                                                  FROM "public"."memberships"
                                                                                                                  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."status" = 'active'::"text") AND ("memberships"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]))))));



CREATE POLICY "Team non-viewers can delete contacts" ON "public"."contacts" FOR DELETE USING (("team_id" IN ( SELECT "memberships"."team_id"
                                                                                                              FROM "public"."memberships"
                                                                                                              WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."status" = 'active'::"text") AND ("memberships"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]))))));



CREATE POLICY "Team owners can delete their team" ON "public"."teams" FOR DELETE USING (("id" IN ( SELECT "memberships"."team_id"
                                                                                                   FROM "public"."memberships"
                                                                                                   WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."status" = 'active'::"text") AND ("memberships"."role" = 'owner'::"text")))));



CREATE POLICY "Team owners can update their team" ON "public"."teams" FOR UPDATE USING (("id" IN ( SELECT "memberships"."team_id"
                                                                                                   FROM "public"."memberships"
                                                                                                   WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."status" = 'active'::"text") AND ("memberships"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Users can insert own profile" ON "public"."user_profiles" FOR INSERT WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "Users can update own profile" ON "public"."user_profiles" FOR UPDATE USING (("id" = "auth"."uid"()));



CREATE POLICY "Users can view own profile" ON "public"."user_profiles" FOR SELECT USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."user_profiles";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."accept_invitation"("p_invite_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_invitation"("p_invite_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_invitation"("p_invite_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_team_ids"("uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_team_ids"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_team_ids"("uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."activities" TO "anon";
GRANT ALL ON TABLE "public"."activities" TO "authenticated";
GRANT ALL ON TABLE "public"."activities" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."invitations" TO "anon";
GRANT ALL ON TABLE "public"."invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."invitations" TO "service_role";



GRANT ALL ON TABLE "public"."memberships" TO "anon";
GRANT ALL ON TABLE "public"."memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."memberships" TO "service_role";



GRANT ALL ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



