
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "access_requests": {
                  Row: {
                    "created_at": string,"decided_at": string | null,"decided_by": string | null,"feature": string | null,"id": string,"plan_code": string,"status": Database["public"]['Enums']["access_request_status"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"feature"?: string | null,"id"?: string,"plan_code": string,"status"?: Database["public"]['Enums']["access_request_status"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"feature"?: string | null,"id"?: string,"plan_code"?: string,"status"?: Database["public"]['Enums']["access_request_status"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "access_requests_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "access_requests_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "access_requests_plan_code_fkey"
      columns: ["plan_code"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "access_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "access_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"account_deletions": {
                  Row: {
                    "cancelled_at": string | null,"requested_at": string,"scheduled_for": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancelled_at"?: string | null,"requested_at"?: string,"scheduled_for": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "cancelled_at"?: string | null,"requested_at"?: string,"scheduled_for"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "account_deletions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "account_deletions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"activity_entries": {
                  Row: {
                    "client_id": string,"id": string,"local_date": string,"metric": Database["public"]['Enums']["activity_metric"],"recorded_at": string,"sleep_quality": number | null,"source": Database["public"]['Enums']["activity_source"],"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"id"?: string,"local_date": string,"metric": Database["public"]['Enums']["activity_metric"],"recorded_at"?: string,"sleep_quality"?: number | null,"source"?: Database["public"]['Enums']["activity_source"],"value": number
                  }
                  Update: {
                    "client_id"?: string,"id"?: string,"local_date"?: string,"metric"?: Database["public"]['Enums']["activity_metric"],"recorded_at"?: string,"sleep_quality"?: number | null,"source"?: Database["public"]['Enums']["activity_source"],"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_entries_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_entries_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"admin_audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"id": number,"metadata": NonNullable<Json>,"reason": string | null,"target_id": string | null,"target_type": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"id"?: never,"metadata"?: NonNullable<Json>,"reason"?: string | null,"target_id"?: string | null,"target_type"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"id"?: never,"metadata"?: NonNullable<Json>,"reason"?: string | null,"target_id"?: string | null,"target_type"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"app_open_opt_outs": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "app_open_opt_outs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "app_open_opt_outs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"app_opens": {
                  Row: {
                    "id": number,"opened_at": string,"source": Database["public"]['Enums']["notification_type"] | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: never,"opened_at"?: string,"source"?: Database["public"]['Enums']["notification_type"] | null,"user_id": string
                  }
                  Update: {
                    "id"?: never,"opened_at"?: string,"source"?: Database["public"]['Enums']["notification_type"] | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "app_opens_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "app_opens_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"assistant_progress_blocks": {
                  Row: {
                    "coaching_id": string,"created_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "coaching_id": string,"created_at"?: string
                  }
                  Update: {
                    "coaching_id"?: string,"created_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assistant_progress_blocks_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: true
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "assistant_progress_blocks_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: true
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "assistant_progress_blocks_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: true
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    }
                  ]
                },"badges": {
                  Row: {
                    "code": string,"family": string,"position": number,"threshold": number
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"family": string,"position": number,"threshold": number
                  }
                  Update: {
                    "code"?: string,"family"?: string,"position"?: number,"threshold"?: number
                  }
                  Relationships: [
                    
                  ]
                },"body_profiles": {
                  Row: {
                    "activity_level": Database["public"]['Enums']["activity_level"] | null,"birth_date": string | null,"calc_sex": Database["public"]['Enums']["calc_sex"] | null,"height_cm": number | null,"preferred_target_coaching_id": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_level"?: Database["public"]['Enums']["activity_level"] | null,"birth_date"?: string | null,"calc_sex"?: Database["public"]['Enums']["calc_sex"] | null,"height_cm"?: number | null,"preferred_target_coaching_id"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "activity_level"?: Database["public"]['Enums']["activity_level"] | null,"birth_date"?: string | null,"calc_sex"?: Database["public"]['Enums']["calc_sex"] | null,"height_cm"?: number | null,"preferred_target_coaching_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "body_profiles_preferred_target_coaching_id_fkey"
      columns: ["preferred_target_coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "body_profiles_preferred_target_coaching_id_fkey"
      columns: ["preferred_target_coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "body_profiles_preferred_target_coaching_id_fkey"
      columns: ["preferred_target_coaching_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "body_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "body_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"bonuses": {
                  Row: {
                    "beneficiary_id": string,"coaching_id": string | null,"created_at": string,"discount_percent": number | null,"granted_at": string | null,"id": string,"kind": Database["public"]['Enums']["bonus_kind"],"pass_id": string | null,"plan_grant_id": string | null,"referral_id": string,"sessions": number | null,"status": Database["public"]['Enums']["bonus_status"],"voided_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "beneficiary_id": string,"coaching_id"?: string | null,"created_at"?: string,"discount_percent"?: number | null,"granted_at"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["bonus_kind"],"pass_id"?: string | null,"plan_grant_id"?: string | null,"referral_id": string,"sessions"?: number | null,"status"?: Database["public"]['Enums']["bonus_status"],"voided_at"?: string | null
                  }
                  Update: {
                    "beneficiary_id"?: string,"coaching_id"?: string | null,"created_at"?: string,"discount_percent"?: number | null,"granted_at"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["bonus_kind"],"pass_id"?: string | null,"plan_grant_id"?: string | null,"referral_id"?: string,"sessions"?: number | null,"status"?: Database["public"]['Enums']["bonus_status"],"voided_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "bonuses_beneficiary_id_fkey"
      columns: ["beneficiary_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bonuses_beneficiary_id_fkey"
      columns: ["beneficiary_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bonuses_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "bonuses_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "bonuses_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bonuses_pass_id_fkey"
      columns: ["pass_id"]
isOneToOne: false
      referencedRelation: "pass_balances"
      referencedColumns: ["pass_id"]
    },{
      foreignKeyName: "bonuses_pass_id_fkey"
      columns: ["pass_id"]
isOneToOne: false
      referencedRelation: "passes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bonuses_referral_id_fkey"
      columns: ["referral_id"]
isOneToOne: false
      referencedRelation: "referrals"
      referencedColumns: ["id"]
    }
                  ]
                },"booking_events": {
                  Row: {
                    "actor_id": string | null,"actor_role": Database["public"]['Enums']["actor_role"],"booking_id": string,"created_at": string,"from_status": Database["public"]['Enums']["booking_status"] | null,"id": number,"payload": NonNullable<Json>,"reason": string | null,"to_status": Database["public"]['Enums']["booking_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"actor_role": Database["public"]['Enums']["actor_role"],"booking_id": string,"created_at"?: string,"from_status"?: Database["public"]['Enums']["booking_status"] | null,"id"?: never,"payload"?: NonNullable<Json>,"reason"?: string | null,"to_status": Database["public"]['Enums']["booking_status"]
                  }
                  Update: {
                    "actor_id"?: string | null,"actor_role"?: Database["public"]['Enums']["actor_role"],"booking_id"?: string,"created_at"?: string,"from_status"?: Database["public"]['Enums']["booking_status"] | null,"id"?: never,"payload"?: NonNullable<Json>,"reason"?: string | null,"to_status"?: Database["public"]['Enums']["booking_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "booking_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "booking_events_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    }
                  ]
                },"bookings": {
                  Row: {
                    "attendance_marked_at": string | null,"attendance_marked_by": string | null,"cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"cancelled_by_role": Database["public"]['Enums']["actor_role"] | null,"client_id": string,"coaching_id": string,"confirmed_at": string | null,"created_at": string,"decided_by": string | null,"id": string,"requested_at": string | null,"rescheduled_to_id": string | null,"reserved_pass_id": string | null,"session_id": string,"source": Database["public"]['Enums']["booking_source"],"status": Database["public"]['Enums']["booking_status"],"trainer_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attendance_marked_at"?: string | null,"attendance_marked_by"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"cancelled_by_role"?: Database["public"]['Enums']["actor_role"] | null,"client_id": string,"coaching_id": string,"confirmed_at"?: string | null,"created_at"?: string,"decided_by"?: string | null,"id"?: string,"requested_at"?: string | null,"rescheduled_to_id"?: string | null,"reserved_pass_id"?: string | null,"session_id": string,"source": Database["public"]['Enums']["booking_source"],"status": Database["public"]['Enums']["booking_status"],"trainer_id": string,"updated_at"?: string
                  }
                  Update: {
                    "attendance_marked_at"?: string | null,"attendance_marked_by"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"cancelled_by_role"?: Database["public"]['Enums']["actor_role"] | null,"client_id"?: string,"coaching_id"?: string,"confirmed_at"?: string | null,"created_at"?: string,"decided_by"?: string | null,"id"?: string,"requested_at"?: string | null,"rescheduled_to_id"?: string | null,"reserved_pass_id"?: string | null,"session_id"?: string,"source"?: Database["public"]['Enums']["booking_source"],"status"?: Database["public"]['Enums']["booking_status"],"trainer_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_attendance_marked_by_fkey"
      columns: ["attendance_marked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_attendance_marked_by_fkey"
      columns: ["attendance_marked_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_pair_fkey"
      columns: ["coaching_id","trainer_id","client_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id","trainer_id","client_id"]
    },{
      foreignKeyName: "bookings_pair_fkey"
      columns: ["coaching_id","trainer_id","client_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id","trainer_id","client_id"]
    },{
      foreignKeyName: "bookings_pair_fkey"
      columns: ["coaching_id","trainer_id","client_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id","trainer_id","client_id"]
    },{
      foreignKeyName: "bookings_rescheduled_to_fkey"
      columns: ["rescheduled_to_id","coaching_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id","coaching_id"]
    },{
      foreignKeyName: "bookings_reserved_pass_fkey"
      columns: ["reserved_pass_id","coaching_id"]
isOneToOne: false
      referencedRelation: "pass_balances"
      referencedColumns: ["pass_id","coaching_id"]
    },{
      foreignKeyName: "bookings_reserved_pass_fkey"
      columns: ["reserved_pass_id","coaching_id"]
isOneToOne: false
      referencedRelation: "passes"
      referencedColumns: ["id","coaching_id"]
    },{
      foreignKeyName: "bookings_session_fkey"
      columns: ["session_id","trainer_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id","trainer_id"]
    },{
      foreignKeyName: "bookings_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"break_glass_grants": {
                  Row: {
                    "admin_id": string,"categories": (Database["public"]['Enums']["share_category"])[],"created_at": string,"expires_at": string,"id": string,"reason": string,"revoked_at": string | null,"target_user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_id": string,"categories": (Database["public"]['Enums']["share_category"])[],"created_at"?: string,"expires_at": string,"id"?: string,"reason": string,"revoked_at"?: string | null,"target_user_id": string
                  }
                  Update: {
                    "admin_id"?: string,"categories"?: (Database["public"]['Enums']["share_category"])[],"created_at"?: string,"expires_at"?: string,"id"?: string,"reason"?: string,"revoked_at"?: string | null,"target_user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "break_glass_grants_admin_id_fkey"
      columns: ["admin_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "break_glass_grants_admin_id_fkey"
      columns: ["admin_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "break_glass_grants_target_user_id_fkey"
      columns: ["target_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "break_glass_grants_target_user_id_fkey"
      columns: ["target_user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"broadcasts": {
                  Row: {
                    "body": string,"button_kind": string | null,"button_url": string | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"group_id": string,"id": string,"trainer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"button_kind"?: string | null,"button_url"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"group_id": string,"id"?: string,"trainer_id": string
                  }
                  Update: {
                    "body"?: string,"button_kind"?: string | null,"button_url"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"group_id"?: string,"id"?: string,"trainer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "broadcasts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "broadcasts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "broadcasts_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "broadcasts_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"calendar_feeds": {
                  Row: {
                    "created_at": string,"id": string,"last_accessed_at": string | null,"revoked_at": string | null,"token_hash": string,"user_id": string,"zone": Database["public"]['Enums']["app_zone"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"last_accessed_at"?: string | null,"revoked_at"?: string | null,"token_hash": string,"user_id": string,"zone": Database["public"]['Enums']["app_zone"]
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"last_accessed_at"?: string | null,"revoked_at"?: string | null,"token_hash"?: string,"user_id"?: string,"zone"?: Database["public"]['Enums']["app_zone"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "calendar_feeds_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calendar_feeds_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"challenge_participants": {
                  Row: {
                    "alias": string | null,"challenge_id": string,"coaching_id": string,"id": string,"joined_at": string,"score": number,"score_updated_at": string | null,"show_on_leaderboard": boolean,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alias"?: string | null,"challenge_id": string,"coaching_id": string,"id"?: string,"joined_at"?: string,"score"?: number,"score_updated_at"?: string | null,"show_on_leaderboard"?: boolean,"user_id": string
                  }
                  Update: {
                    "alias"?: string | null,"challenge_id"?: string,"coaching_id"?: string,"id"?: string,"joined_at"?: string,"score"?: number,"score_updated_at"?: string | null,"show_on_leaderboard"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "challenge_participants_challenge_id_fkey"
      columns: ["challenge_id"]
isOneToOne: false
      referencedRelation: "challenges"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "challenge_participants_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "challenge_participants_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "challenge_participants_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "challenge_participants_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "challenge_participants_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"challenges": {
                  Row: {
                    "cancelled_at": string | null,"created_at": string,"ends_on": string,"finished_at": string | null,"goal": number | null,"group_id": string,"id": string,"leaderboard": boolean,"metric": string,"starts_on": string,"title": string,"trainer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancelled_at"?: string | null,"created_at"?: string,"ends_on": string,"finished_at"?: string | null,"goal"?: number | null,"group_id": string,"id"?: string,"leaderboard"?: boolean,"metric": string,"starts_on": string,"title": string,"trainer_id": string
                  }
                  Update: {
                    "cancelled_at"?: string | null,"created_at"?: string,"ends_on"?: string,"finished_at"?: string | null,"goal"?: number | null,"group_id"?: string,"id"?: string,"leaderboard"?: boolean,"metric"?: string,"starts_on"?: string,"title"?: string,"trainer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "challenges_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "challenges_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"check_ins": {
                  Row: {
                    "booking_id": string,"checked_in_at": string,"client_id": string,"method": Database["public"]['Enums']["check_in_method"],"recorded_by": string | null,"trainer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_id": string,"checked_in_at"?: string,"client_id": string,"method": Database["public"]['Enums']["check_in_method"],"recorded_by"?: string | null,"trainer_id": string
                  }
                  Update: {
                    "booking_id"?: string,"checked_in_at"?: string,"client_id"?: string,"method"?: Database["public"]['Enums']["check_in_method"],"recorded_by"?: string | null,"trainer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "check_ins_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: true
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "check_ins_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "check_ins_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "check_ins_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "check_ins_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "check_ins_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "check_ins_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"client_goals": {
                  Row: {
                    "goal": Database["public"]['Enums']["goal_type"],"id": string,"set_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "goal": Database["public"]['Enums']["goal_type"],"id"?: string,"set_at"?: string,"user_id": string
                  }
                  Update: {
                    "goal"?: Database["public"]['Enums']["goal_type"],"id"?: string,"set_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_goals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "client_goals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"client_invites": {
                  Row: {
                    "archived_at": string | null,"code": string,"created_at": string,"expires_at": string | null,"id": string,"label": string | null,"max_uses": number | null,"token": string,"trainer_id": string,"uses_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"code"?: string,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"label"?: string | null,"max_uses"?: number | null,"token"?: string,"trainer_id": string,"uses_count"?: number
                  }
                  Update: {
                    "archived_at"?: string | null,"code"?: string,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"label"?: string | null,"max_uses"?: number | null,"token"?: string,"trainer_id"?: string,"uses_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_invites_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"coaching_notes": {
                  Row: {
                    "author_id": string | null,"body": string,"coaching_id": string,"created_at": string,"id": string,"session_id": string | null,"updated_at": string,"visible_to_client": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"coaching_id": string,"created_at"?: string,"id"?: string,"session_id"?: string | null,"updated_at"?: string,"visible_to_client"?: boolean
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"coaching_id"?: string,"created_at"?: string,"id"?: string,"session_id"?: string | null,"updated_at"?: string,"visible_to_client"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "coaching_notes_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coaching_notes_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coaching_notes_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "coaching_notes_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "coaching_notes_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coaching_notes_session_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"coaching_trainer_meta": {
                  Row: {
                    "archived_at": string | null,"client_alias": string | null,"coaching_id": string,"contact": string | null,"created_at": string,"intake_seen_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"client_alias"?: string | null,"coaching_id": string,"contact"?: string | null,"created_at"?: string,"intake_seen_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"client_alias"?: string | null,"coaching_id"?: string,"contact"?: string | null,"created_at"?: string,"intake_seen_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "coaching_trainer_meta_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: true
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "coaching_trainer_meta_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: true
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "coaching_trainer_meta_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: true
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    }
                  ]
                },"coachings": {
                  Row: {
                    "broadcasts_muted": boolean,"client_id": string,"client_invite_id": string | null,"client_reminder_offsets": (number)[],"created_at": string,"debt_limit_sessions": number | null,"end_reason": string | null,"ended_at": string | null,"ended_by": string | null,"id": string,"primary_nutrition_group_id": string | null,"self_book_on_debt": boolean,"source": Database["public"]['Enums']["coaching_source"],"started_at": string,"status": Database["public"]['Enums']["coaching_status"],"trainer_id": string,"trial_link_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "broadcasts_muted"?: boolean,"client_id": string,"client_invite_id"?: string | null,"client_reminder_offsets": (number)[],"created_at"?: string,"debt_limit_sessions"?: number | null,"end_reason"?: string | null,"ended_at"?: string | null,"ended_by"?: string | null,"id"?: string,"primary_nutrition_group_id"?: string | null,"self_book_on_debt"?: boolean,"source": Database["public"]['Enums']["coaching_source"],"started_at"?: string,"status"?: Database["public"]['Enums']["coaching_status"],"trainer_id": string,"trial_link_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "broadcasts_muted"?: boolean,"client_id"?: string,"client_invite_id"?: string | null,"client_reminder_offsets"?: (number)[],"created_at"?: string,"debt_limit_sessions"?: number | null,"end_reason"?: string | null,"ended_at"?: string | null,"ended_by"?: string | null,"id"?: string,"primary_nutrition_group_id"?: string | null,"self_book_on_debt"?: boolean,"source"?: Database["public"]['Enums']["coaching_source"],"started_at"?: string,"status"?: Database["public"]['Enums']["coaching_status"],"trainer_id"?: string,"trial_link_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "coachings_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coachings_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coachings_client_invite_fkey"
      columns: ["client_invite_id","trainer_id"]
isOneToOne: false
      referencedRelation: "client_invites"
      referencedColumns: ["id","trainer_id"]
    },{
      foreignKeyName: "coachings_ended_by_fkey"
      columns: ["ended_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coachings_ended_by_fkey"
      columns: ["ended_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coachings_primary_nutrition_group_id_fkey"
      columns: ["primary_nutrition_group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coachings_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "coachings_trial_link_fkey"
      columns: ["trial_link_id","trainer_id"]
isOneToOne: false
      referencedRelation: "trial_links"
      referencedColumns: ["id","trainer_id"]
    }
                  ]
                },"consents": {
                  Row: {
                    "accepted_at": string,"id": string,"kind": Database["public"]['Enums']["consent_kind"],"revoked_at": string | null,"text_hash": string | null,"user_id": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["consent_kind"],"revoked_at"?: string | null,"text_hash"?: string | null,"user_id": string,"version": string
                  }
                  Update: {
                    "accepted_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["consent_kind"],"revoked_at"?: string | null,"text_hash"?: string | null,"user_id"?: string,"version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "consents_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consents_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"contact_requests": {
                  Row: {
                    "coaching_id": string,"created_at": string,"id": string,"recipient_id": string,"requester_id": string,"responded_at": string | null,"status": Database["public"]['Enums']["contact_request_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "coaching_id": string,"created_at"?: string,"id"?: string,"recipient_id": string,"requester_id": string,"responded_at"?: string | null,"status"?: Database["public"]['Enums']["contact_request_status"],"updated_at"?: string
                  }
                  Update: {
                    "coaching_id"?: string,"created_at"?: string,"id"?: string,"recipient_id"?: string,"requester_id"?: string,"responded_at"?: string | null,"status"?: Database["public"]['Enums']["contact_request_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contact_requests_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "contact_requests_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "contact_requests_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_requests_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_requests_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_requests_requester_id_fkey"
      columns: ["requester_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_requests_requester_id_fkey"
      columns: ["requester_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"data_exports": {
                  Row: {
                    "expires_at": string | null,"id": string,"ready_at": string | null,"requested_at": string,"status": Database["public"]['Enums']["export_status"],"storage_path": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "expires_at"?: string | null,"id"?: string,"ready_at"?: string | null,"requested_at"?: string,"status"?: Database["public"]['Enums']["export_status"],"storage_path"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "expires_at"?: string | null,"id"?: string,"ready_at"?: string | null,"requested_at"?: string,"status"?: Database["public"]['Enums']["export_status"],"storage_path"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "data_exports_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "data_exports_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"data_shares": {
                  Row: {
                    "coaching_id": string,"created_at": string,"intake": boolean,"intake_decided_at": string | null,"measurements": boolean,"nutrition": boolean,"photos": boolean,"steps": boolean,"updated_at": string,"workouts": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "coaching_id": string,"created_at"?: string,"intake"?: boolean,"intake_decided_at"?: string | null,"measurements"?: boolean,"nutrition"?: boolean,"photos"?: boolean,"steps"?: boolean,"updated_at"?: string,"workouts"?: boolean
                  }
                  Update: {
                    "coaching_id"?: string,"created_at"?: string,"intake"?: boolean,"intake_decided_at"?: string | null,"measurements"?: boolean,"nutrition"?: boolean,"photos"?: boolean,"steps"?: boolean,"updated_at"?: string,"workouts"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "data_shares_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: true
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "data_shares_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: true
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "data_shares_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: true
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    }
                  ]
                },"delegation_clients": {
                  Row: {
                    "coaching_id": string,"delegation_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "coaching_id": string,"delegation_id": string
                  }
                  Update: {
                    "coaching_id"?: string,"delegation_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "delegation_clients_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "delegation_clients_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "delegation_clients_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "delegation_clients_delegation_id_fkey"
      columns: ["delegation_id"]
isOneToOne: false
      referencedRelation: "delegations"
      referencedColumns: ["id"]
    }
                  ]
                },"delegations": {
                  Row: {
                    "accepted_at": string | null,"all_clients": boolean,"created_at": string,"delegate_trainer_id": string | null,"ends_at": string | null,"id": string,"invite_hash": string | null,"invited_trainer_id": string | null,"kind": Database["public"]['Enums']["delegation_kind"],"lead_id": string | null,"owner_trainer_id": string,"reminded_at": string | null,"revoked_at": string | null,"scopes": (Database["public"]['Enums']["delegation_scope"])[],"session_id": string | null,"starts_at": string,"status": Database["public"]['Enums']["delegation_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"all_clients"?: boolean,"created_at"?: string,"delegate_trainer_id"?: string | null,"ends_at"?: string | null,"id"?: string,"invite_hash"?: string | null,"invited_trainer_id"?: string | null,"kind": Database["public"]['Enums']["delegation_kind"],"lead_id"?: string | null,"owner_trainer_id": string,"reminded_at"?: string | null,"revoked_at"?: string | null,"scopes": (Database["public"]['Enums']["delegation_scope"])[],"session_id"?: string | null,"starts_at"?: string,"status"?: Database["public"]['Enums']["delegation_status"]
                  }
                  Update: {
                    "accepted_at"?: string | null,"all_clients"?: boolean,"created_at"?: string,"delegate_trainer_id"?: string | null,"ends_at"?: string | null,"id"?: string,"invite_hash"?: string | null,"invited_trainer_id"?: string | null,"kind"?: Database["public"]['Enums']["delegation_kind"],"lead_id"?: string | null,"owner_trainer_id"?: string,"reminded_at"?: string | null,"revoked_at"?: string | null,"scopes"?: (Database["public"]['Enums']["delegation_scope"])[],"session_id"?: string | null,"starts_at"?: string,"status"?: Database["public"]['Enums']["delegation_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "delegations_delegate_trainer_id_fkey"
      columns: ["delegate_trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "delegations_invited_trainer_id_fkey"
      columns: ["invited_trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "delegations_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "delegations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "delegations_owner_trainer_id_fkey"
      columns: ["owner_trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "delegations_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"exercise_translations": {
                  Row: {
                    "created_at": string,"description": string | null,"exercise_id": string,"locale": Database["public"]['Enums']["app_locale"],"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"exercise_id": string,"locale": Database["public"]['Enums']["app_locale"],"name": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"exercise_id"?: string,"locale"?: Database["public"]['Enums']["app_locale"],"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exercise_translations_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    }
                  ]
                },"exercises": {
                  Row: {
                    "archived_at": string | null,"category": string | null,"created_at": string,"equipment": (string)[],"id": string,"image_path": string | null,"license": string | null,"license_author": string | null,"muscles_primary": (string)[],"muscles_secondary": (string)[],"name": string,"owner_id": string | null,"source": Database["public"]['Enums']["exercise_source"],"source_url": string | null,"updated_at": string,"video_url": string | null,"wger_id": number | null,"wger_uuid": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"category"?: string | null,"created_at"?: string,"equipment"?: (string)[],"id"?: string,"image_path"?: string | null,"license"?: string | null,"license_author"?: string | null,"muscles_primary"?: (string)[],"muscles_secondary"?: (string)[],"name": string,"owner_id"?: string | null,"source": Database["public"]['Enums']["exercise_source"],"source_url"?: string | null,"updated_at"?: string,"video_url"?: string | null,"wger_id"?: number | null,"wger_uuid"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"category"?: string | null,"created_at"?: string,"equipment"?: (string)[],"id"?: string,"image_path"?: string | null,"license"?: string | null,"license_author"?: string | null,"muscles_primary"?: (string)[],"muscles_secondary"?: (string)[],"name"?: string,"owner_id"?: string | null,"source"?: Database["public"]['Enums']["exercise_source"],"source_url"?: string | null,"updated_at"?: string,"video_url"?: string | null,"wger_id"?: number | null,"wger_uuid"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "exercises_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exercises_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"feedback": {
                  Row: {
                    "app_version": string | null,"attachment_paths": (string)[],"body": string,"created_at": string,"github_issue_url": string | null,"id": string,"kind": Database["public"]['Enums']["feedback_kind"],"locale": Database["public"]['Enums']["app_locale"] | null,"platform": string | null,"replied_at": string | null,"replied_by": string | null,"reply": string | null,"route": string | null,"status": Database["public"]['Enums']["feedback_status"],"theme": Database["public"]['Enums']["app_theme"] | null,"updated_at": string,"user_id": string | null,"zone": Database["public"]['Enums']["app_zone"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "app_version"?: string | null,"attachment_paths"?: (string)[],"body": string,"created_at"?: string,"github_issue_url"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["feedback_kind"],"locale"?: Database["public"]['Enums']["app_locale"] | null,"platform"?: string | null,"replied_at"?: string | null,"replied_by"?: string | null,"reply"?: string | null,"route"?: string | null,"status"?: Database["public"]['Enums']["feedback_status"],"theme"?: Database["public"]['Enums']["app_theme"] | null,"updated_at"?: string,"user_id"?: string | null,"zone"?: Database["public"]['Enums']["app_zone"] | null
                  }
                  Update: {
                    "app_version"?: string | null,"attachment_paths"?: (string)[],"body"?: string,"created_at"?: string,"github_issue_url"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["feedback_kind"],"locale"?: Database["public"]['Enums']["app_locale"] | null,"platform"?: string | null,"replied_at"?: string | null,"replied_by"?: string | null,"reply"?: string | null,"route"?: string | null,"status"?: Database["public"]['Enums']["feedback_status"],"theme"?: Database["public"]['Enums']["app_theme"] | null,"updated_at"?: string,"user_id"?: string | null,"zone"?: Database["public"]['Enums']["app_zone"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "feedback_replied_by_fkey"
      columns: ["replied_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedback_replied_by_fkey"
      columns: ["replied_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedback_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedback_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"food_day_comments": {
                  Row: {
                    "author_id": string | null,"body": string,"client_id": string,"coaching_id": string,"created_at": string,"hidden_by_admin_at": string | null,"hidden_by_client_at": string | null,"id": string,"local_date": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"client_id": string,"coaching_id": string,"created_at"?: string,"hidden_by_admin_at"?: string | null,"hidden_by_client_at"?: string | null,"id"?: string,"local_date": string,"updated_at"?: string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"client_id"?: string,"coaching_id"?: string,"created_at"?: string,"hidden_by_admin_at"?: string | null,"hidden_by_client_at"?: string | null,"id"?: string,"local_date"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "food_day_comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "food_day_comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "food_day_comments_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "food_day_comments_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "food_day_comments_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "food_day_comments_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "food_day_comments_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    }
                  ]
                },"food_diary_entries": {
                  Row: {
                    "carbs_g": number | null,"client_id": string,"fat_g": number | null,"food_id": string | null,"grams": number | null,"id": string,"kcal": number,"local_date": string,"logged_at": string,"meal": Database["public"]['Enums']["meal_type"],"protein_g": number | null,"servings": number | null,"title": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "carbs_g"?: number | null,"client_id": string,"fat_g"?: number | null,"food_id"?: string | null,"grams"?: number | null,"id"?: string,"kcal": number,"local_date": string,"logged_at"?: string,"meal": Database["public"]['Enums']["meal_type"],"protein_g"?: number | null,"servings"?: number | null,"title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "carbs_g"?: number | null,"client_id"?: string,"fat_g"?: number | null,"food_id"?: string | null,"grams"?: number | null,"id"?: string,"kcal"?: number,"local_date"?: string,"logged_at"?: string,"meal"?: Database["public"]['Enums']["meal_type"],"protein_g"?: number | null,"servings"?: number | null,"title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "food_diary_entries_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "food_diary_entries_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "food_diary_entries_food_id_fkey"
      columns: ["food_id"]
isOneToOne: false
      referencedRelation: "foods"
      referencedColumns: ["id"]
    }
                  ]
                },"food_dish_items": {
                  Row: {
                    "dish_id": string,"food_id": string,"grams": number,"position": number
                  }
                  ComputedFields: never
                  Insert: {
                    "dish_id": string,"food_id": string,"grams": number,"position": number
                  }
                  Update: {
                    "dish_id"?: string,"food_id"?: string,"grams"?: number,"position"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "food_dish_items_dish_id_fkey"
      columns: ["dish_id"]
isOneToOne: false
      referencedRelation: "foods"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "food_dish_items_food_id_fkey"
      columns: ["food_id"]
isOneToOne: false
      referencedRelation: "foods"
      referencedColumns: ["id"]
    }
                  ]
                },"food_favorites": {
                  Row: {
                    "created_at": string,"food_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"food_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"food_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "food_favorites_food_id_fkey"
      columns: ["food_id"]
isOneToOne: false
      referencedRelation: "foods"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "food_favorites_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "food_favorites_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"foods": {
                  Row: {
                    "archived_at": string | null,"barcode": string | null,"brand": string | null,"carbs_100g": number | null,"created_at": string,"fat_100g": number | null,"id": string,"kcal_100g": number,"kind": Database["public"]['Enums']["food_kind"],"lang": string | null,"name": string,"off_code": string | null,"off_fetched_at": string | null,"owner_id": string | null,"protein_100g": number | null,"serving_g": number | null,"serving_label": string | null,"source": Database["public"]['Enums']["food_source"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"barcode"?: string | null,"brand"?: string | null,"carbs_100g"?: number | null,"created_at"?: string,"fat_100g"?: number | null,"id"?: string,"kcal_100g": number,"kind"?: Database["public"]['Enums']["food_kind"],"lang"?: string | null,"name": string,"off_code"?: string | null,"off_fetched_at"?: string | null,"owner_id"?: string | null,"protein_100g"?: number | null,"serving_g"?: number | null,"serving_label"?: string | null,"source": Database["public"]['Enums']["food_source"],"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"barcode"?: string | null,"brand"?: string | null,"carbs_100g"?: number | null,"created_at"?: string,"fat_100g"?: number | null,"id"?: string,"kcal_100g"?: number,"kind"?: Database["public"]['Enums']["food_kind"],"lang"?: string | null,"name"?: string,"off_code"?: string | null,"off_fetched_at"?: string | null,"owner_id"?: string | null,"protein_100g"?: number | null,"serving_g"?: number | null,"serving_label"?: string | null,"source"?: Database["public"]['Enums']["food_source"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "foods_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "foods_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"group_members": {
                  Row: {
                    "added_at": string,"client_id": string,"coaching_id": string,"group_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_at"?: string,"client_id": string,"coaching_id": string,"group_id": string
                  }
                  Update: {
                    "added_at"?: string,"client_id"?: string,"coaching_id"?: string,"group_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_members_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_members_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_members_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "group_members_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "group_members_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_members_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"groups": {
                  Row: {
                    "archived_at": string | null,"color": string | null,"created_at": string,"description": string | null,"goal": Database["public"]['Enums']["goal_type"] | null,"id": string,"name": string,"trainer_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"color"?: string | null,"created_at"?: string,"description"?: string | null,"goal"?: Database["public"]['Enums']["goal_type"] | null,"id"?: string,"name": string,"trainer_id": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"color"?: string | null,"created_at"?: string,"description"?: string | null,"goal"?: Database["public"]['Enums']["goal_type"] | null,"id"?: string,"name"?: string,"trainer_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "groups_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"health_erasures": {
                  Row: {
                    "done_at": string | null,"revoked_at": string,"scheduled_for": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "done_at"?: string | null,"revoked_at"?: string,"scheduled_for"?: string,"user_id": string
                  }
                  Update: {
                    "done_at"?: string | null,"revoked_at"?: string,"scheduled_for"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "health_erasures_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "health_erasures_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"homework": {
                  Row: {
                    "archived_at": string | null,"coaching_id": string,"created_at": string,"created_by": string | null,"description": string | null,"due_date": string,"id": string,"repeat_until": string | null,"repeat_weekdays": (number)[] | null,"title": string,"updated_at": string,"video_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"coaching_id": string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_date": string,"id"?: string,"repeat_until"?: string | null,"repeat_weekdays"?: (number)[] | null,"title": string,"updated_at"?: string,"video_url"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"coaching_id"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_date"?: string,"id"?: string,"repeat_until"?: string | null,"repeat_weekdays"?: (number)[] | null,"title"?: string,"updated_at"?: string,"video_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "homework_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "homework_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "homework_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "homework_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "homework_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"homework_exercises": {
                  Row: {
                    "exercise_id": string,"homework_id": string,"position": number,"prescription": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "exercise_id": string,"homework_id": string,"position": number,"prescription"?: string | null
                  }
                  Update: {
                    "exercise_id"?: string,"homework_id"?: string,"position"?: number,"prescription"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "homework_exercises_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "homework_exercises_homework_id_fkey"
      columns: ["homework_id"]
isOneToOne: false
      referencedRelation: "homework"
      referencedColumns: ["id"]
    }
                  ]
                },"homework_occurrences": {
                  Row: {
                    "comment": string | null,"done_at": string | null,"due_on": string,"homework_id": string,"id": string,"workout_log_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "comment"?: string | null,"done_at"?: string | null,"due_on": string,"homework_id": string,"id"?: string,"workout_log_id"?: string | null
                  }
                  Update: {
                    "comment"?: string | null,"done_at"?: string | null,"due_on"?: string,"homework_id"?: string,"id"?: string,"workout_log_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "homework_occurrences_homework_id_fkey"
      columns: ["homework_id"]
isOneToOne: false
      referencedRelation: "homework"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "homework_occurrences_workout_log_id_fkey"
      columns: ["workout_log_id"]
isOneToOne: false
      referencedRelation: "workout_logs"
      referencedColumns: ["id"]
    }
                  ]
                },"ingest_tokens": {
                  Row: {
                    "created_at": string,"id": string,"last_used_at": string | null,"revoked_at": string | null,"scope": string,"token_hash": string,"user_id": string,"window_count": number,"window_start": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"last_used_at"?: string | null,"revoked_at"?: string | null,"scope"?: string,"token_hash": string,"user_id": string,"window_count"?: number,"window_start"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"last_used_at"?: string | null,"revoked_at"?: string | null,"scope"?: string,"token_hash"?: string,"user_id"?: string,"window_count"?: number,"window_start"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ingest_tokens_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ingest_tokens_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"intakes": {
                  Row: {
                    "answers": NonNullable<Json>,"form_version": string,"id": string,"parq_answers": NonNullable<Json>,"parq_flagged": boolean,"submitted_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answers": NonNullable<Json>,"form_version": string,"id"?: string,"parq_answers": NonNullable<Json>,"parq_flagged"?: never,"submitted_at"?: string,"user_id": string
                  }
                  Update: {
                    "answers"?: NonNullable<Json>,"form_version"?: string,"id"?: string,"parq_answers"?: NonNullable<Json>,"parq_flagged"?: never,"submitted_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "intakes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "intakes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"invited_trainers": {
                  Row: {
                    "created_at": string,"inviter_id": string,"trainer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"inviter_id": string,"trainer_id": string
                  }
                  Update: {
                    "created_at"?: string,"inviter_id"?: string,"trainer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invited_trainers_inviter_id_fkey"
      columns: ["inviter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invited_trainers_inviter_id_fkey"
      columns: ["inviter_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invited_trainers_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: true
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"ledger_entries": {
                  Row: {
                    "amount_minor": number,"booking_id": string | null,"charge_reason": Database["public"]['Enums']["charge_reason"] | null,"client_id": string,"coaching_id": string,"created_at": string,"created_by": string | null,"currency": string | null,"entry_type": Database["public"]['Enums']["ledger_entry_type"],"id": string,"note": string | null,"occurred_at": string,"pass_id": string | null,"related_entry_id": string | null,"sessions_delta": number,"trainer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor"?: number,"booking_id"?: string | null,"charge_reason"?: Database["public"]['Enums']["charge_reason"] | null,"client_id": string,"coaching_id": string,"created_at"?: string,"created_by"?: string | null,"currency"?: string | null,"entry_type": Database["public"]['Enums']["ledger_entry_type"],"id"?: string,"note"?: string | null,"occurred_at": string,"pass_id"?: string | null,"related_entry_id"?: string | null,"sessions_delta": number,"trainer_id": string
                  }
                  Update: {
                    "amount_minor"?: number,"booking_id"?: string | null,"charge_reason"?: Database["public"]['Enums']["charge_reason"] | null,"client_id"?: string,"coaching_id"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string | null,"entry_type"?: Database["public"]['Enums']["ledger_entry_type"],"id"?: string,"note"?: string | null,"occurred_at"?: string,"pass_id"?: string | null,"related_entry_id"?: string | null,"sessions_delta"?: number,"trainer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ledger_entries_booking_fkey"
      columns: ["booking_id","coaching_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id","coaching_id"]
    },{
      foreignKeyName: "ledger_entries_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_pair_fkey"
      columns: ["coaching_id","trainer_id","client_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id","trainer_id","client_id"]
    },{
      foreignKeyName: "ledger_entries_pair_fkey"
      columns: ["coaching_id","trainer_id","client_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id","trainer_id","client_id"]
    },{
      foreignKeyName: "ledger_entries_pair_fkey"
      columns: ["coaching_id","trainer_id","client_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id","trainer_id","client_id"]
    },{
      foreignKeyName: "ledger_entries_pass_fkey"
      columns: ["pass_id","coaching_id"]
isOneToOne: false
      referencedRelation: "pass_balances"
      referencedColumns: ["pass_id","coaching_id"]
    },{
      foreignKeyName: "ledger_entries_pass_fkey"
      columns: ["pass_id","coaching_id"]
isOneToOne: false
      referencedRelation: "passes"
      referencedColumns: ["id","coaching_id"]
    },{
      foreignKeyName: "ledger_entries_related_entry_fkey"
      columns: ["related_entry_id","coaching_id"]
isOneToOne: false
      referencedRelation: "ledger_entries"
      referencedColumns: ["id","coaching_id"]
    },{
      foreignKeyName: "ledger_entries_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"location_check_in_tokens": {
                  Row: {
                    "issued_at": string,"location_id": string,"token": string,"trainer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "issued_at"?: string,"location_id": string,"token": string,"trainer_id": string
                  }
                  Update: {
                    "issued_at"?: string,"location_id"?: string,"token"?: string,"trainer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "location_check_in_tokens_location_id_fkey"
      columns: ["location_id"]
isOneToOne: true
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "location_check_in_tokens_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "location_check_in_tokens_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"locations": {
                  Row: {
                    "address": string | null,"archived_at": string | null,"created_at": string,"id": string,"lat": number | null,"lng": number | null,"name": string,"notes": string | null,"trainer_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"archived_at"?: string | null,"created_at"?: string,"id"?: string,"lat"?: number | null,"lng"?: number | null,"name": string,"notes"?: string | null,"trainer_id": string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"archived_at"?: string | null,"created_at"?: string,"id"?: string,"lat"?: number | null,"lng"?: number | null,"name"?: string,"notes"?: string | null,"trainer_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "locations_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"managed_client_claims": {
                  Row: {
                    "claimant_id": string,"created_at": string,"decided_at": string | null,"id": string,"managed_client_id": string | null,"new_coaching_id": string | null,"status": Database["public"]['Enums']["managed_client_claim_status"],"trainer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "claimant_id": string,"created_at"?: string,"decided_at"?: string | null,"id"?: string,"managed_client_id"?: string | null,"new_coaching_id"?: string | null,"status"?: Database["public"]['Enums']["managed_client_claim_status"],"trainer_id": string
                  }
                  Update: {
                    "claimant_id"?: string,"created_at"?: string,"decided_at"?: string | null,"id"?: string,"managed_client_id"?: string | null,"new_coaching_id"?: string | null,"status"?: Database["public"]['Enums']["managed_client_claim_status"],"trainer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "managed_client_claims_claimant_id_fkey"
      columns: ["claimant_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "managed_client_claims_claimant_id_fkey"
      columns: ["claimant_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "managed_client_claims_managed_client_id_fkey"
      columns: ["managed_client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "managed_client_claims_managed_client_id_fkey"
      columns: ["managed_client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "managed_client_claims_new_coaching_id_fkey"
      columns: ["new_coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "managed_client_claims_new_coaching_id_fkey"
      columns: ["new_coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "managed_client_claims_new_coaching_id_fkey"
      columns: ["new_coaching_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "managed_client_claims_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"measurements": {
                  Row: {
                    "client_id": string,"created_at": string,"entered_by": string | null,"id": string,"kind": Database["public"]['Enums']["measurement_kind"],"local_date": string,"measured_at": string,"note": string | null,"updated_at": string,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"created_at"?: string,"entered_by"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["measurement_kind"],"local_date": string,"measured_at": string,"note"?: string | null,"updated_at"?: string,"value": number
                  }
                  Update: {
                    "client_id"?: string,"created_at"?: string,"entered_by"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["measurement_kind"],"local_date"?: string,"measured_at"?: string,"note"?: string | null,"updated_at"?: string,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "measurements_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "measurements_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "measurements_entered_by_fkey"
      columns: ["entered_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "measurements_entered_by_fkey"
      columns: ["entered_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"milestones": {
                  Row: {
                    "achieved_at": string,"booking_id": string | null,"coaching_id": string,"id": string,"kind": Database["public"]['Enums']["milestone_kind"]
                  }
                  ComputedFields: never
                  Insert: {
                    "achieved_at": string,"booking_id"?: string | null,"coaching_id": string,"id"?: string,"kind": Database["public"]['Enums']["milestone_kind"]
                  }
                  Update: {
                    "achieved_at"?: string,"booking_id"?: string | null,"coaching_id"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["milestone_kind"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "milestones_booking_fkey"
      columns: ["booking_id","coaching_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id","coaching_id"]
    },{
      foreignKeyName: "milestones_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "milestones_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "milestones_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    }
                  ]
                },"money_events": {
                  Row: {
                    "action": Database["public"]['Enums']["money_event_action"],"actor_id": string | null,"actor_role": Database["public"]['Enums']["actor_role"],"client_id": string,"coaching_id": string,"created_at": string,"freeze_id": string | null,"id": number,"new_values": Json | null,"old_values": Json | null,"pass_id": string | null,"payment_id": string | null,"reason": string | null,"trainer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": Database["public"]['Enums']["money_event_action"],"actor_id"?: string | null,"actor_role": Database["public"]['Enums']["actor_role"],"client_id": string,"coaching_id": string,"created_at"?: string,"freeze_id"?: string | null,"id"?: never,"new_values"?: Json | null,"old_values"?: Json | null,"pass_id"?: string | null,"payment_id"?: string | null,"reason"?: string | null,"trainer_id": string
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["money_event_action"],"actor_id"?: string | null,"actor_role"?: Database["public"]['Enums']["actor_role"],"client_id"?: string,"coaching_id"?: string,"created_at"?: string,"freeze_id"?: string | null,"id"?: never,"new_values"?: Json | null,"old_values"?: Json | null,"pass_id"?: string | null,"payment_id"?: string | null,"reason"?: string | null,"trainer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "money_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "money_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "money_events_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "money_events_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "money_events_pair_fkey"
      columns: ["coaching_id","trainer_id","client_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id","trainer_id","client_id"]
    },{
      foreignKeyName: "money_events_pair_fkey"
      columns: ["coaching_id","trainer_id","client_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id","trainer_id","client_id"]
    },{
      foreignKeyName: "money_events_pair_fkey"
      columns: ["coaching_id","trainer_id","client_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id","trainer_id","client_id"]
    }
                  ]
                },"monthly_report_shares": {
                  Row: {
                    "client_id": string,"coaching_id": string,"month": string,"report": NonNullable<Json>,"shared_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"coaching_id": string,"month": string,"report": NonNullable<Json>,"shared_at"?: string
                  }
                  Update: {
                    "client_id"?: string,"coaching_id"?: string,"month"?: string,"report"?: NonNullable<Json>,"shared_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "monthly_report_shares_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "monthly_report_shares_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "monthly_report_shares_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "monthly_report_shares_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "monthly_report_shares_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_outbox": {
                  Row: {
                    "attempts": number,"booking_id": string | null,"broadcast_id": string | null,"chat_target": string | null,"created_at": string,"dedupe_key": string,"deliver_after": string,"id": number,"last_error": string | null,"locked_until": string | null,"payload": NonNullable<Json>,"scheduled_for": string,"sent_at": string | null,"session_id": string | null,"status": Database["public"]['Enums']["outbox_status"],"telegram_message_id": number | null,"type": Database["public"]['Enums']["notification_type"],"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"booking_id"?: string | null,"broadcast_id"?: string | null,"chat_target"?: string | null,"created_at"?: string,"dedupe_key": string,"deliver_after": string,"id"?: never,"last_error"?: string | null,"locked_until"?: string | null,"payload": NonNullable<Json>,"scheduled_for": string,"sent_at"?: string | null,"session_id"?: string | null,"status"?: Database["public"]['Enums']["outbox_status"],"telegram_message_id"?: number | null,"type": Database["public"]['Enums']["notification_type"],"user_id"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"booking_id"?: string | null,"broadcast_id"?: string | null,"chat_target"?: string | null,"created_at"?: string,"dedupe_key"?: string,"deliver_after"?: string,"id"?: never,"last_error"?: string | null,"locked_until"?: string | null,"payload"?: NonNullable<Json>,"scheduled_for"?: string,"sent_at"?: string | null,"session_id"?: string | null,"status"?: Database["public"]['Enums']["outbox_status"],"telegram_message_id"?: number | null,"type"?: Database["public"]['Enums']["notification_type"],"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_outbox_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_outbox_broadcast_id_fkey"
      columns: ["broadcast_id"]
isOneToOne: false
      referencedRelation: "broadcasts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_outbox_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_outbox_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_outbox_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_preferences": {
                  Row: {
                    "created_at": string,"enabled": boolean,"type": Database["public"]['Enums']["notification_type"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"enabled": boolean,"type": Database["public"]['Enums']["notification_type"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"enabled"?: boolean,"type"?: Database["public"]['Enums']["notification_type"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"nutrition_targets": {
                  Row: {
                    "calc_inputs": Json | null,"carbs_g": number | null,"client_id": string | null,"coaching_id": string | null,"created_at": string,"effective_from": string,"effective_to": string | null,"fat_g": number | null,"group_id": string | null,"id": string,"kcal": number,"low_kcal_confirmed_at": string | null,"protein_g": number | null,"set_by": string | null,"source": Database["public"]['Enums']["target_source"],"steps_target": number | null,"water_ml": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "calc_inputs"?: Json | null,"carbs_g"?: number | null,"client_id"?: string | null,"coaching_id"?: string | null,"created_at"?: string,"effective_from": string,"effective_to"?: string | null,"fat_g"?: number | null,"group_id"?: string | null,"id"?: string,"kcal": number,"low_kcal_confirmed_at"?: string | null,"protein_g"?: number | null,"set_by"?: string | null,"source": Database["public"]['Enums']["target_source"],"steps_target"?: number | null,"water_ml"?: number | null
                  }
                  Update: {
                    "calc_inputs"?: Json | null,"carbs_g"?: number | null,"client_id"?: string | null,"coaching_id"?: string | null,"created_at"?: string,"effective_from"?: string,"effective_to"?: string | null,"fat_g"?: number | null,"group_id"?: string | null,"id"?: string,"kcal"?: number,"low_kcal_confirmed_at"?: string | null,"protein_g"?: number | null,"set_by"?: string | null,"source"?: Database["public"]['Enums']["target_source"],"steps_target"?: number | null,"water_ml"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "nutrition_targets_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "nutrition_targets_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "nutrition_targets_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "nutrition_targets_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "nutrition_targets_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "nutrition_targets_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "nutrition_targets_set_by_fkey"
      columns: ["set_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "nutrition_targets_set_by_fkey"
      columns: ["set_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"packages": {
                  Row: {
                    "applies_to": Database["public"]['Enums']["package_applies_to"],"archived_at": string | null,"created_at": string,"currency": string,"id": string,"is_public": boolean,"price_minor": number,"price_updated_at": string,"sessions_count": number,"sort_order": number,"title": string,"trainer_id": string,"updated_at": string,"validity_days": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "applies_to"?: Database["public"]['Enums']["package_applies_to"],"archived_at"?: string | null,"created_at"?: string,"currency": string,"id"?: string,"is_public"?: boolean,"price_minor": number,"price_updated_at"?: string,"sessions_count": number,"sort_order"?: number,"title": string,"trainer_id": string,"updated_at"?: string,"validity_days"?: number | null
                  }
                  Update: {
                    "applies_to"?: Database["public"]['Enums']["package_applies_to"],"archived_at"?: string | null,"created_at"?: string,"currency"?: string,"id"?: string,"is_public"?: boolean,"price_minor"?: number,"price_updated_at"?: string,"sessions_count"?: number,"sort_order"?: number,"title"?: string,"trainer_id"?: string,"updated_at"?: string,"validity_days"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "packages_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"pass_freezes": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"pass_id": string,"period": unknown,"reason": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"pass_id": string,"period": unknown,"reason"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"pass_id"?: string,"period"?: unknown,"reason"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pass_freezes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pass_freezes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pass_freezes_pass_id_fkey"
      columns: ["pass_id"]
isOneToOne: false
      referencedRelation: "pass_balances"
      referencedColumns: ["pass_id"]
    },{
      foreignKeyName: "pass_freezes_pass_id_fkey"
      columns: ["pass_id"]
isOneToOne: false
      referencedRelation: "passes"
      referencedColumns: ["id"]
    }
                  ]
                },"passes": {
                  Row: {
                    "applies_to": Database["public"]['Enums']["package_applies_to"],"cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"client_id": string,"coaching_id": string,"created_at": string,"currency": string,"expires_at": string | null,"id": string,"is_bonus": boolean,"is_drop_in": boolean,"note": string | null,"package_id": string | null,"price_minor": number,"sessions_total": number,"sold_by": string | null,"starts_on": string,"status": Database["public"]['Enums']["pass_status"],"title": string,"trainer_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "applies_to"?: Database["public"]['Enums']["package_applies_to"],"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"client_id": string,"coaching_id": string,"created_at"?: string,"currency": string,"expires_at"?: string | null,"id"?: string,"is_bonus"?: boolean,"is_drop_in"?: boolean,"note"?: string | null,"package_id"?: string | null,"price_minor": number,"sessions_total": number,"sold_by"?: string | null,"starts_on": string,"status"?: Database["public"]['Enums']["pass_status"],"title": string,"trainer_id": string,"updated_at"?: string
                  }
                  Update: {
                    "applies_to"?: Database["public"]['Enums']["package_applies_to"],"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"client_id"?: string,"coaching_id"?: string,"created_at"?: string,"currency"?: string,"expires_at"?: string | null,"id"?: string,"is_bonus"?: boolean,"is_drop_in"?: boolean,"note"?: string | null,"package_id"?: string | null,"price_minor"?: number,"sessions_total"?: number,"sold_by"?: string | null,"starts_on"?: string,"status"?: Database["public"]['Enums']["pass_status"],"title"?: string,"trainer_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "passes_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "passes_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "passes_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "passes_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "passes_package_fkey"
      columns: ["package_id","trainer_id"]
isOneToOne: false
      referencedRelation: "packages"
      referencedColumns: ["id","trainer_id"]
    },{
      foreignKeyName: "passes_package_fkey"
      columns: ["package_id","trainer_id"]
isOneToOne: false
      referencedRelation: "price_grid"
      referencedColumns: ["drop_in_package_id","trainer_id"]
    },{
      foreignKeyName: "passes_package_fkey"
      columns: ["package_id","trainer_id"]
isOneToOne: false
      referencedRelation: "price_grid"
      referencedColumns: ["package_id","trainer_id"]
    },{
      foreignKeyName: "passes_pair_fkey"
      columns: ["coaching_id","trainer_id","client_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id","trainer_id","client_id"]
    },{
      foreignKeyName: "passes_pair_fkey"
      columns: ["coaching_id","trainer_id","client_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id","trainer_id","client_id"]
    },{
      foreignKeyName: "passes_pair_fkey"
      columns: ["coaching_id","trainer_id","client_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id","trainer_id","client_id"]
    },{
      foreignKeyName: "passes_sold_by_fkey"
      columns: ["sold_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "passes_sold_by_fkey"
      columns: ["sold_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "passes_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"payment_links": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"id": string,"kind": Database["public"]['Enums']["payment_link_kind"],"sort_order": number,"title": string,"trainer_id": string,"updated_at": string,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["payment_link_kind"],"sort_order"?: number,"title": string,"trainer_id": string,"updated_at"?: string,"url": string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["payment_link_kind"],"sort_order"?: number,"title"?: string,"trainer_id"?: string,"updated_at"?: string,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_links_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_minor": number,"client_id": string,"coaching_id": string,"confirmed_at": string | null,"confirmed_by": string | null,"created_at": string,"currency": string,"direction": Database["public"]['Enums']["payment_direction"],"id": string,"method": Database["public"]['Enums']["payment_method"],"note": string | null,"paid_at": string,"pass_id": string | null,"reported_by": string | null,"status": Database["public"]['Enums']["payment_status"],"trainer_id": string,"updated_at": string,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"client_id": string,"coaching_id": string,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"currency": string,"direction"?: Database["public"]['Enums']["payment_direction"],"id"?: string,"method": Database["public"]['Enums']["payment_method"],"note"?: string | null,"paid_at": string,"pass_id"?: string | null,"reported_by"?: string | null,"status": Database["public"]['Enums']["payment_status"],"trainer_id": string,"updated_at"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount_minor"?: number,"client_id"?: string,"coaching_id"?: string,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"currency"?: string,"direction"?: Database["public"]['Enums']["payment_direction"],"id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"note"?: string | null,"paid_at"?: string,"pass_id"?: string | null,"reported_by"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"trainer_id"?: string,"updated_at"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_pair_fkey"
      columns: ["coaching_id","trainer_id","client_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id","trainer_id","client_id"]
    },{
      foreignKeyName: "payments_pair_fkey"
      columns: ["coaching_id","trainer_id","client_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id","trainer_id","client_id"]
    },{
      foreignKeyName: "payments_pair_fkey"
      columns: ["coaching_id","trainer_id","client_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id","trainer_id","client_id"]
    },{
      foreignKeyName: "payments_pass_fkey"
      columns: ["pass_id","coaching_id"]
isOneToOne: false
      referencedRelation: "pass_balances"
      referencedColumns: ["pass_id","coaching_id"]
    },{
      foreignKeyName: "payments_pass_fkey"
      columns: ["pass_id","coaching_id"]
isOneToOne: false
      referencedRelation: "passes"
      referencedColumns: ["id","coaching_id"]
    },{
      foreignKeyName: "payments_reported_by_fkey"
      columns: ["reported_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_reported_by_fkey"
      columns: ["reported_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "payments_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"personal_records": {
                  Row: {
                    "achieved_at": string,"client_id": string,"exercise_id": string,"record_type": Database["public"]['Enums']["pr_type"],"set_id": string | null,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "achieved_at": string,"client_id": string,"exercise_id": string,"record_type": Database["public"]['Enums']["pr_type"],"set_id"?: string | null,"value": number
                  }
                  Update: {
                    "achieved_at"?: string,"client_id"?: string,"exercise_id"?: string,"record_type"?: Database["public"]['Enums']["pr_type"],"set_id"?: string | null,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "personal_records_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "personal_records_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "personal_records_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "personal_records_set_id_fkey"
      columns: ["set_id"]
isOneToOne: false
      referencedRelation: "visible_personal_records"
      referencedColumns: ["set_id"]
    },{
      foreignKeyName: "personal_records_set_id_fkey"
      columns: ["set_id"]
isOneToOne: false
      referencedRelation: "workout_sets"
      referencedColumns: ["id"]
    }
                  ]
                },"plan_grants": {
                  Row: {
                    "created_at": string,"expires_at": string | null,"granted_by": string | null,"id": string,"plan_code": string,"reason": string,"revoke_reason": string | null,"revoked_at": string | null,"revoked_by": string | null,"source": Database["public"]['Enums']["plan_grant_source"],"starts_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string | null,"granted_by"?: string | null,"id"?: string,"plan_code": string,"reason": string,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"source"?: Database["public"]['Enums']["plan_grant_source"],"starts_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string | null,"granted_by"?: string | null,"id"?: string,"plan_code"?: string,"reason"?: string,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"source"?: Database["public"]['Enums']["plan_grant_source"],"starts_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_grants_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_grants_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_grants_plan_code_fkey"
      columns: ["plan_code"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "plan_grants_revoked_by_fkey"
      columns: ["revoked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_grants_revoked_by_fkey"
      columns: ["revoked_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_grants_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_grants_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"plans": {
                  Row: {
                    "code": string,"currency": string | null,"features": (string)[],"limits": NonNullable<Json>,"price_minor": number | null,"rank": number,"side": Database["public"]['Enums']["plan_side"],"title": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"currency"?: string | null,"features"?: (string)[],"limits"?: NonNullable<Json>,"price_minor"?: number | null,"rank": number,"side": Database["public"]['Enums']["plan_side"],"title": NonNullable<Json>
                  }
                  Update: {
                    "code"?: string,"currency"?: string | null,"features"?: (string)[],"limits"?: NonNullable<Json>,"price_minor"?: number | null,"rank"?: number,"side"?: Database["public"]['Enums']["plan_side"],"title"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_path": string | null,"blocked_at": string | null,"blocked_reason": string | null,"bot_blocked_at": string | null,"bot_started_at": string | null,"claimed_by": string | null,"created_at": string,"display_name": string | null,"first_name": string | null,"id": string,"language_code": string | null,"last_name": string | null,"last_seen_at": string | null,"managed_by_trainer_id": string | null,"photo_url": string | null,"telegram_id": number | null,"time_zone": string,"updated_at": string,"username": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"blocked_at"?: string | null,"blocked_reason"?: string | null,"bot_blocked_at"?: string | null,"bot_started_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"display_name"?: string | null,"first_name"?: string | null,"id": string,"language_code"?: string | null,"last_name"?: string | null,"last_seen_at"?: string | null,"managed_by_trainer_id"?: string | null,"photo_url"?: string | null,"telegram_id"?: number | null,"time_zone"?: string,"updated_at"?: string,"username"?: string | null
                  }
                  Update: {
                    "avatar_path"?: string | null,"blocked_at"?: string | null,"blocked_reason"?: string | null,"bot_blocked_at"?: string | null,"bot_started_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"display_name"?: string | null,"first_name"?: string | null,"id"?: string,"language_code"?: string | null,"last_name"?: string | null,"last_seen_at"?: string | null,"managed_by_trainer_id"?: string | null,"photo_url"?: string | null,"telegram_id"?: number | null,"time_zone"?: string,"updated_at"?: string,"username"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_claimed_by_fkey"
      columns: ["claimed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_claimed_by_fkey"
      columns: ["claimed_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_managed_by_trainer_id_fkey"
      columns: ["managed_by_trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"progress_photos": {
                  Row: {
                    "angle": Database["public"]['Enums']["photo_angle"],"blur_method": string,"client_id": string,"created_at": string,"face_blurred": boolean,"height": number,"id": string,"note": string | null,"storage_path": string,"taken_on": string,"updated_at": string,"width": number
                  }
                  ComputedFields: never
                  Insert: {
                    "angle": Database["public"]['Enums']["photo_angle"],"blur_method": string,"client_id": string,"created_at"?: string,"face_blurred": boolean,"height": number,"id"?: string,"note"?: string | null,"storage_path": string,"taken_on": string,"updated_at"?: string,"width": number
                  }
                  Update: {
                    "angle"?: Database["public"]['Enums']["photo_angle"],"blur_method"?: string,"client_id"?: string,"created_at"?: string,"face_blurred"?: boolean,"height"?: number,"id"?: string,"note"?: string | null,"storage_path"?: string,"taken_on"?: string,"updated_at"?: string,"width"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "progress_photos_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "progress_photos_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"public_data_consents": {
                  Row: {
                    "accepted_at": string,"bans": (string)[],"condition": string | null,"fields": (string)[],"id": string,"location_ids": (string)[],"revoked_at": string | null,"scope": string,"user_id": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string,"bans"?: (string)[],"condition"?: string | null,"fields"?: (string)[],"id"?: string,"location_ids"?: (string)[],"revoked_at"?: string | null,"scope": string,"user_id": string,"version": string
                  }
                  Update: {
                    "accepted_at"?: string,"bans"?: (string)[],"condition"?: string | null,"fields"?: (string)[],"id"?: string,"location_ids"?: (string)[],"revoked_at"?: string | null,"scope"?: string,"user_id"?: string,"version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "public_data_consents_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "public_data_consents_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"recurrences": {
                  Row: {
                    "capacity": number,"coaching_id": string | null,"created_at": string,"created_by": string | null,"dtstart_local": string,"duration_min": number,"ended_at": string | null,"id": string,"kind": Database["public"]['Enums']["session_kind"],"location_id": string | null,"materialized_until": string | null,"meeting_url": string | null,"mode": Database["public"]['Enums']["session_mode"],"occurrence_count": number | null,"open_for_booking": boolean,"rrule": string,"time_zone": string,"title": string | null,"trainer_id": string,"until_date": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "capacity"?: number,"coaching_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"dtstart_local": string,"duration_min": number,"ended_at"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["session_kind"],"location_id"?: string | null,"materialized_until"?: string | null,"meeting_url"?: string | null,"mode"?: Database["public"]['Enums']["session_mode"],"occurrence_count"?: number | null,"open_for_booking"?: boolean,"rrule": string,"time_zone": string,"title"?: string | null,"trainer_id": string,"until_date"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "capacity"?: number,"coaching_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"dtstart_local"?: string,"duration_min"?: number,"ended_at"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["session_kind"],"location_id"?: string | null,"materialized_until"?: string | null,"meeting_url"?: string | null,"mode"?: Database["public"]['Enums']["session_mode"],"occurrence_count"?: number | null,"open_for_booking"?: boolean,"rrule"?: string,"time_zone"?: string,"title"?: string | null,"trainer_id"?: string,"until_date"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recurrences_coaching_fkey"
      columns: ["coaching_id","trainer_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id","trainer_id"]
    },{
      foreignKeyName: "recurrences_coaching_fkey"
      columns: ["coaching_id","trainer_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id","trainer_id"]
    },{
      foreignKeyName: "recurrences_coaching_fkey"
      columns: ["coaching_id","trainer_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id","trainer_id"]
    },{
      foreignKeyName: "recurrences_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurrences_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurrences_location_fkey"
      columns: ["location_id","trainer_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","trainer_id"]
    },{
      foreignKeyName: "recurrences_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"referral_codes": {
                  Row: {
                    "coaching_id": string,"code": string,"created_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "coaching_id": string,"code": string,"created_at"?: string
                  }
                  Update: {
                    "coaching_id"?: string,"code"?: string,"created_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "referral_codes_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: true
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "referral_codes_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: true
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "referral_codes_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: true
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    }
                  ]
                },"referral_offers": {
                  Row: {
                    "active_to": string | null,"archived_at": string | null,"created_at": string,"currency": string | null,"id": string,"min_amount_minor": number | null,"package_id": string | null,"referee_sessions": number,"referrer_sessions": number,"trainer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active_to"?: string | null,"archived_at"?: string | null,"created_at"?: string,"currency"?: string | null,"id"?: string,"min_amount_minor"?: number | null,"package_id"?: string | null,"referee_sessions"?: number,"referrer_sessions": number,"trainer_id": string
                  }
                  Update: {
                    "active_to"?: string | null,"archived_at"?: string | null,"created_at"?: string,"currency"?: string | null,"id"?: string,"min_amount_minor"?: number | null,"package_id"?: string | null,"referee_sessions"?: number,"referrer_sessions"?: number,"trainer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "referral_offers_package_fkey"
      columns: ["package_id","trainer_id"]
isOneToOne: false
      referencedRelation: "packages"
      referencedColumns: ["id","trainer_id"]
    },{
      foreignKeyName: "referral_offers_package_fkey"
      columns: ["package_id","trainer_id"]
isOneToOne: false
      referencedRelation: "price_grid"
      referencedColumns: ["drop_in_package_id","trainer_id"]
    },{
      foreignKeyName: "referral_offers_package_fkey"
      columns: ["package_id","trainer_id"]
isOneToOne: false
      referencedRelation: "price_grid"
      referencedColumns: ["package_id","trainer_id"]
    },{
      foreignKeyName: "referral_offers_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"referrals": {
                  Row: {
                    "coaching_id": string | null,"created_at": string,"id": string,"kind": Database["public"]['Enums']["referral_kind"],"offer_id": string | null,"qualified_at": string | null,"qualifying_payment_id": string | null,"referee_id": string,"referrer_coaching_id": string | null,"referrer_id": string,"status": Database["public"]['Enums']["referral_status"],"trainer_id": string | null,"void_reason": Database["public"]['Enums']["referral_void_reason"] | null,"voided_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "coaching_id"?: string | null,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["referral_kind"],"offer_id"?: string | null,"qualified_at"?: string | null,"qualifying_payment_id"?: string | null,"referee_id": string,"referrer_coaching_id"?: string | null,"referrer_id": string,"status"?: Database["public"]['Enums']["referral_status"],"trainer_id"?: string | null,"void_reason"?: Database["public"]['Enums']["referral_void_reason"] | null,"voided_at"?: string | null
                  }
                  Update: {
                    "coaching_id"?: string | null,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["referral_kind"],"offer_id"?: string | null,"qualified_at"?: string | null,"qualifying_payment_id"?: string | null,"referee_id"?: string,"referrer_coaching_id"?: string | null,"referrer_id"?: string,"status"?: Database["public"]['Enums']["referral_status"],"trainer_id"?: string | null,"void_reason"?: Database["public"]['Enums']["referral_void_reason"] | null,"voided_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "referrals_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: true
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "referrals_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: true
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "referrals_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: true
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "referrals_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "referral_offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "referrals_qualifying_payment_id_fkey"
      columns: ["qualifying_payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "referrals_referee_id_fkey"
      columns: ["referee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "referrals_referee_id_fkey"
      columns: ["referee_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "referrals_referrer_coaching_id_fkey"
      columns: ["referrer_coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "referrals_referrer_coaching_id_fkey"
      columns: ["referrer_coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "referrals_referrer_coaching_id_fkey"
      columns: ["referrer_coaching_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "referrals_referrer_id_fkey"
      columns: ["referrer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "referrals_referrer_id_fkey"
      columns: ["referrer_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "referrals_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "referrals_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reports": {
                  Row: {
                    "appeal_of": string | null,"appealed_by": string | null,"body": string | null,"created_at": string,"id": string,"reason": string,"reporter_contact": string | null,"reporter_id": string | null,"resolution_note": string | null,"resolved_at": string | null,"resolved_by": string | null,"status": Database["public"]['Enums']["report_status"],"target_id": string,"target_owner_id": string | null,"target_snapshot": string | null,"target_type": Database["public"]['Enums']["report_target"]
                  }
                  ComputedFields: never
                  Insert: {
                    "appeal_of"?: string | null,"appealed_by"?: string | null,"body"?: string | null,"created_at"?: string,"id"?: string,"reason": string,"reporter_contact"?: string | null,"reporter_id"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["report_status"],"target_id": string,"target_owner_id"?: string | null,"target_snapshot"?: string | null,"target_type": Database["public"]['Enums']["report_target"]
                  }
                  Update: {
                    "appeal_of"?: string | null,"appealed_by"?: string | null,"body"?: string | null,"created_at"?: string,"id"?: string,"reason"?: string,"reporter_contact"?: string | null,"reporter_id"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["report_status"],"target_id"?: string,"target_owner_id"?: string | null,"target_snapshot"?: string | null,"target_type"?: Database["public"]['Enums']["report_target"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_appeal_of_fkey"
      columns: ["appeal_of"]
isOneToOne: false
      referencedRelation: "reports"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_appealed_by_fkey"
      columns: ["appealed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_appealed_by_fkey"
      columns: ["appealed_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_target_owner_id_fkey"
      columns: ["target_owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_target_owner_id_fkey"
      columns: ["target_owner_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"review_revisions": {
                  Row: {
                    "body": string | null,"created_at": string,"id": string,"rating": number,"review_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"rating": number,"review_id": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"rating"?: number,"review_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_revisions_review_id_fkey"
      columns: ["review_id"]
isOneToOne: false
      referencedRelation: "reviews"
      referencedColumns: ["id"]
    }
                  ]
                },"reviews": {
                  Row: {
                    "body": string | null,"client_id": string,"coaching_id": string,"created_at": string,"deleted_at": string | null,"hidden_reason": string | null,"id": string,"publish_asked_at": string | null,"publish_consent": boolean | null,"rating": number,"status": Database["public"]['Enums']["review_status"],"trainer_id": string,"trainer_replied_at": string | null,"trainer_reply": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"client_id": string,"coaching_id": string,"created_at"?: string,"deleted_at"?: string | null,"hidden_reason"?: string | null,"id"?: string,"publish_asked_at"?: string | null,"publish_consent"?: boolean | null,"rating": number,"status"?: Database["public"]['Enums']["review_status"],"trainer_id": string,"trainer_replied_at"?: string | null,"trainer_reply"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string | null,"client_id"?: string,"coaching_id"?: string,"created_at"?: string,"deleted_at"?: string | null,"hidden_reason"?: string | null,"id"?: string,"publish_asked_at"?: string | null,"publish_consent"?: boolean | null,"rating"?: number,"status"?: Database["public"]['Enums']["review_status"],"trainer_id"?: string,"trainer_replied_at"?: string | null,"trainer_reply"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: true
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "reviews_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: true
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "reviews_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: true
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"sessions": {
                  Row: {
                    "cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"capacity": number,"completed_at": string | null,"conducted_by": string | null,"created_at": string,"created_by": string | null,"ends_at": string,"id": string,"is_exception": boolean,"kind": Database["public"]['Enums']["session_kind"],"location_id": string | null,"manually_adjusted_at": string | null,"meeting_url": string | null,"mode": Database["public"]['Enums']["session_mode"],"open_for_booking": boolean,"original_starts_at": string | null,"recurrence_id": string | null,"slot_id": string | null,"starts_at": string,"status": Database["public"]['Enums']["session_status"],"title": string | null,"trainer_id": string,"trial_link_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"capacity"?: number,"completed_at"?: string | null,"conducted_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at": string,"id"?: string,"is_exception"?: boolean,"kind": Database["public"]['Enums']["session_kind"],"location_id"?: string | null,"manually_adjusted_at"?: string | null,"meeting_url"?: string | null,"mode": Database["public"]['Enums']["session_mode"],"open_for_booking"?: boolean,"original_starts_at"?: string | null,"recurrence_id"?: string | null,"slot_id"?: string | null,"starts_at": string,"status"?: Database["public"]['Enums']["session_status"],"title"?: string | null,"trainer_id": string,"trial_link_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"capacity"?: number,"completed_at"?: string | null,"conducted_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at"?: string,"id"?: string,"is_exception"?: boolean,"kind"?: Database["public"]['Enums']["session_kind"],"location_id"?: string | null,"manually_adjusted_at"?: string | null,"meeting_url"?: string | null,"mode"?: Database["public"]['Enums']["session_mode"],"open_for_booking"?: boolean,"original_starts_at"?: string | null,"recurrence_id"?: string | null,"slot_id"?: string | null,"starts_at"?: string,"status"?: Database["public"]['Enums']["session_status"],"title"?: string | null,"trainer_id"?: string,"trial_link_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sessions_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sessions_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sessions_conducted_by_fkey"
      columns: ["conducted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sessions_conducted_by_fkey"
      columns: ["conducted_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sessions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sessions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sessions_location_fkey"
      columns: ["location_id","trainer_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","trainer_id"]
    },{
      foreignKeyName: "sessions_recurrence_fkey"
      columns: ["recurrence_id","trainer_id"]
isOneToOne: false
      referencedRelation: "recurrences"
      referencedColumns: ["id","trainer_id"]
    },{
      foreignKeyName: "sessions_slot_fkey"
      columns: ["slot_id","trainer_id"]
isOneToOne: false
      referencedRelation: "slots"
      referencedColumns: ["id","trainer_id"]
    },{
      foreignKeyName: "sessions_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "sessions_trial_link_fkey"
      columns: ["trial_link_id","trainer_id"]
isOneToOne: false
      referencedRelation: "trial_links"
      referencedColumns: ["id","trainer_id"]
    }
                  ]
                },"signup_sources": {
                  Row: {
                    "campaign": string | null,"created_at": string,"entry": Database["public"]['Enums']["signup_entry"],"source": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign"?: string | null,"created_at"?: string,"entry": Database["public"]['Enums']["signup_entry"],"source"?: string | null,"user_id": string
                  }
                  Update: {
                    "campaign"?: string | null,"created_at"?: string,"entry"?: Database["public"]['Enums']["signup_entry"],"source"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "signup_sources_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "signup_sources_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"slots": {
                  Row: {
                    "allow_trial": boolean,"created_at": string,"ends_at": string,"id": string,"location_id": string | null,"mode": Database["public"]['Enums']["session_mode"],"starts_at": string,"status": Database["public"]['Enums']["slot_status"],"template_item_id": string | null,"trainer_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allow_trial"?: boolean,"created_at"?: string,"ends_at": string,"id"?: string,"location_id"?: string | null,"mode"?: Database["public"]['Enums']["session_mode"],"starts_at": string,"status"?: Database["public"]['Enums']["slot_status"],"template_item_id"?: string | null,"trainer_id": string,"updated_at"?: string
                  }
                  Update: {
                    "allow_trial"?: boolean,"created_at"?: string,"ends_at"?: string,"id"?: string,"location_id"?: string | null,"mode"?: Database["public"]['Enums']["session_mode"],"starts_at"?: string,"status"?: Database["public"]['Enums']["slot_status"],"template_item_id"?: string | null,"trainer_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "slots_location_fkey"
      columns: ["location_id","trainer_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","trainer_id"]
    },{
      foreignKeyName: "slots_template_item_id_fkey"
      columns: ["template_item_id"]
isOneToOne: false
      referencedRelation: "week_template_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "slots_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"story_cards": {
                  Row: {
                    "created_at": string,"data": NonNullable<Json>,"expires_at": string,"id": string,"kind": string,"month": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"data": NonNullable<Json>,"expires_at"?: string,"id"?: string,"kind": string,"month": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"data"?: NonNullable<Json>,"expires_at"?: string,"id"?: string,"kind"?: string,"month"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "story_cards_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "story_cards_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"trainer_certificates": {
                  Row: {
                    "created_at": string,"id": string,"issued_on": string | null,"issuer": string | null,"storage_path": string,"title": string,"trainer_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"issued_on"?: string | null,"issuer"?: string | null,"storage_path": string,"title": string,"trainer_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"issued_on"?: string | null,"issuer"?: string | null,"storage_path"?: string,"title"?: string,"trainer_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trainer_certificates_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"trainer_churn_dismissals": {
                  Row: {
                    "coaching_id": string,"created_at": string,"hidden_until": string
                  }
                  ComputedFields: never
                  Insert: {
                    "coaching_id": string,"created_at"?: string,"hidden_until": string
                  }
                  Update: {
                    "coaching_id"?: string,"created_at"?: string,"hidden_until"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trainer_churn_dismissals_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: true
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "trainer_churn_dismissals_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: true
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "trainer_churn_dismissals_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: true
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    }
                  ]
                },"trainer_honors": {
                  Row: {
                    "granted_at": string,"granted_by": string | null,"honor": Database["public"]['Enums']["trainer_honor"],"reason": string,"trainer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"granted_by"?: string | null,"honor": Database["public"]['Enums']["trainer_honor"],"reason": string,"trainer_id": string
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string | null,"honor"?: Database["public"]['Enums']["trainer_honor"],"reason"?: string,"trainer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trainer_honors_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"trainer_inviter_codes": {
                  Row: {
                    "code": string,"created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"user_id": string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trainer_inviter_codes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trainer_inviter_codes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"trainer_invites": {
                  Row: {
                    "code_hash": string,"code_hint": string,"created_at": string,"created_by": string | null,"expires_at": string | null,"id": string,"note": string | null,"redeemed_at": string | null,"redeemed_by": string | null,"revoked_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code_hash": string,"code_hint": string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"note"?: string | null,"redeemed_at"?: string | null,"redeemed_by"?: string | null,"revoked_at"?: string | null
                  }
                  Update: {
                    "code_hash"?: string,"code_hint"?: string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"note"?: string | null,"redeemed_at"?: string | null,"redeemed_by"?: string | null,"revoked_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "trainer_invites_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trainer_invites_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trainer_invites_redeemed_by_fkey"
      columns: ["redeemed_by"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trainer_invites_redeemed_by_fkey"
      columns: ["redeemed_by"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"trainer_milestones": {
                  Row: {
                    "achieved_at": string,"kind": Database["public"]['Enums']["trainer_milestone_kind"],"trainer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "achieved_at"?: string,"kind": Database["public"]['Enums']["trainer_milestone_kind"],"trainer_id": string
                  }
                  Update: {
                    "achieved_at"?: string,"kind"?: Database["public"]['Enums']["trainer_milestone_kind"],"trainer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trainer_milestones_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"trainer_profiles": {
                  Row: {
                    "bio": string | null,"cancellation_deadline_hours": number,"city": string | null,"created_at": string,"default_client_reminder_offsets": (number)[],"default_currency": string,"headline": string | null,"is_public": boolean,"min_booking_notice_minutes": number,"slug": string,"specialties": (string)[],"story_card_showcase": boolean,"trainer_invite_id": string | null,"updated_at": string,"user_id": string,"verification_status": Database["public"]['Enums']["verification_status"],"verified_at": string | null,"works_offline": boolean,"works_online": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "bio"?: string | null,"cancellation_deadline_hours"?: number,"city"?: string | null,"created_at"?: string,"default_client_reminder_offsets"?: (number)[],"default_currency"?: string,"headline"?: string | null,"is_public"?: boolean,"min_booking_notice_minutes"?: number,"slug": string,"specialties"?: (string)[],"story_card_showcase"?: boolean,"trainer_invite_id"?: string | null,"updated_at"?: string,"user_id": string,"verification_status"?: Database["public"]['Enums']["verification_status"],"verified_at"?: string | null,"works_offline"?: boolean,"works_online"?: boolean
                  }
                  Update: {
                    "bio"?: string | null,"cancellation_deadline_hours"?: number,"city"?: string | null,"created_at"?: string,"default_client_reminder_offsets"?: (number)[],"default_currency"?: string,"headline"?: string | null,"is_public"?: boolean,"min_booking_notice_minutes"?: number,"slug"?: string,"specialties"?: (string)[],"story_card_showcase"?: boolean,"trainer_invite_id"?: string | null,"updated_at"?: string,"user_id"?: string,"verification_status"?: Database["public"]['Enums']["verification_status"],"verified_at"?: string | null,"works_offline"?: boolean,"works_online"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "trainer_profiles_trainer_invite_id_fkey"
      columns: ["trainer_invite_id"]
isOneToOne: true
      referencedRelation: "trainer_invites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trainer_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trainer_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"trainer_referral_codes": {
                  Row: {
                    "code": string,"created_at": string,"trainer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"trainer_id": string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"trainer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trainer_referral_codes_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: true
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"trainer_referral_terms": {
                  Row: {
                    "bonus_kind": Database["public"]['Enums']["bonus_kind"],"discount_percent": number | null,"id": boolean,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bonus_kind"?: Database["public"]['Enums']["bonus_kind"],"discount_percent"?: number | null,"id"?: boolean,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "bonus_kind"?: Database["public"]['Enums']["bonus_kind"],"discount_percent"?: number | null,"id"?: boolean,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "trainer_referral_terms_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trainer_referral_terms_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"trainer_verifications": {
                  Row: {
                    "created_at": string,"decided_by": string | null,"decision": Database["public"]['Enums']["verification_status"],"id": string,"reason": string | null,"trainer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"decided_by"?: string | null,"decision": Database["public"]['Enums']["verification_status"],"id"?: string,"reason"?: string | null,"trainer_id": string
                  }
                  Update: {
                    "created_at"?: string,"decided_by"?: string | null,"decision"?: Database["public"]['Enums']["verification_status"],"id"?: string,"reason"?: string | null,"trainer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trainer_verifications_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trainer_verifications_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trainer_verifications_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"trainer_waitlist": {
                  Row: {
                    "clients": string | null,"consent_version": string,"consented_at": string,"contact": string | null,"created_at": string,"id": string,"locale": string,"name": string,"source": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "clients"?: string | null,"consent_version": string,"consented_at"?: string,"contact"?: string | null,"created_at"?: string,"id"?: string,"locale": string,"name": string,"source"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "clients"?: string | null,"consent_version"?: string,"consented_at"?: string,"contact"?: string | null,"created_at"?: string,"id"?: string,"locale"?: string,"name"?: string,"source"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "trainer_waitlist_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trainer_waitlist_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"trial_links": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"currency": string,"description": string | null,"duration_min": number,"expires_at": string | null,"id": string,"is_enabled": boolean,"location_id": string | null,"max_uses": number | null,"mode": Database["public"]['Enums']["session_mode"] | null,"on_showcase": boolean,"price_minor": number,"title": string,"token": string,"trainer_id": string,"uses_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"currency": string,"description"?: string | null,"duration_min"?: number,"expires_at"?: string | null,"id"?: string,"is_enabled"?: boolean,"location_id"?: string | null,"max_uses"?: number | null,"mode"?: Database["public"]['Enums']["session_mode"] | null,"on_showcase"?: boolean,"price_minor"?: number,"title": string,"token"?: string,"trainer_id": string,"uses_count"?: number
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"currency"?: string,"description"?: string | null,"duration_min"?: number,"expires_at"?: string | null,"id"?: string,"is_enabled"?: boolean,"location_id"?: string | null,"max_uses"?: number | null,"mode"?: Database["public"]['Enums']["session_mode"] | null,"on_showcase"?: boolean,"price_minor"?: number,"title"?: string,"token"?: string,"trainer_id"?: string,"uses_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "trial_links_location_fkey"
      columns: ["location_id","trainer_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","trainer_id"]
    },{
      foreignKeyName: "trial_links_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"user_badges": {
                  Row: {
                    "awarded_at": string,"badge_code": string,"seen_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "awarded_at"?: string,"badge_code": string,"seen_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "awarded_at"?: string,"badge_code"?: string,"seen_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_badges_badge_code_fkey"
      columns: ["badge_code"]
isOneToOne: false
      referencedRelation: "badges"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "user_badges_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_badges_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_roles": {
                  Row: {
                    "granted_at": string,"granted_by": string | null,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"granted_by"?: string | null,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_roles_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_settings": {
                  Row: {
                    "avatar_path": string | null,"created_at": string,"daily_digest_time": string,"display_name": string | null,"last_zone": Database["public"]['Enums']["app_zone"],"locale": Database["public"]['Enums']["app_locale"],"quiet_hours_end": string | null,"quiet_hours_start": string | null,"theme": Database["public"]['Enums']["app_theme"],"time_zone": string,"unit_system": Database["public"]['Enums']["unit_system"] | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"created_at"?: string,"daily_digest_time"?: string,"display_name"?: string | null,"last_zone"?: Database["public"]['Enums']["app_zone"],"locale"?: Database["public"]['Enums']["app_locale"],"quiet_hours_end"?: string | null,"quiet_hours_start"?: string | null,"theme"?: Database["public"]['Enums']["app_theme"],"time_zone"?: string,"unit_system"?: Database["public"]['Enums']["unit_system"] | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "avatar_path"?: string | null,"created_at"?: string,"daily_digest_time"?: string,"display_name"?: string | null,"last_zone"?: Database["public"]['Enums']["app_zone"],"locale"?: Database["public"]['Enums']["app_locale"],"quiet_hours_end"?: string | null,"quiet_hours_start"?: string | null,"theme"?: Database["public"]['Enums']["app_theme"],"time_zone"?: string,"unit_system"?: Database["public"]['Enums']["unit_system"] | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_settings_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_settings_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"waitlist_entries": {
                  Row: {
                    "booking_id": string | null,"client_id": string,"coaching_id": string,"id": string,"joined_at": string,"offer_expires_at": string | null,"offered_at": string | null,"resolved_at": string | null,"session_id": string | null,"slot_id": string | null,"status": Database["public"]['Enums']["waitlist_status"],"trainer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_id"?: string | null,"client_id": string,"coaching_id": string,"id"?: string,"joined_at"?: string,"offer_expires_at"?: string | null,"offered_at"?: string | null,"resolved_at"?: string | null,"session_id"?: string | null,"slot_id"?: string | null,"status"?: Database["public"]['Enums']["waitlist_status"],"trainer_id": string
                  }
                  Update: {
                    "booking_id"?: string | null,"client_id"?: string,"coaching_id"?: string,"id"?: string,"joined_at"?: string,"offer_expires_at"?: string | null,"offered_at"?: string | null,"resolved_at"?: string | null,"session_id"?: string | null,"slot_id"?: string | null,"status"?: Database["public"]['Enums']["waitlist_status"],"trainer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "waitlist_entries_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "waitlist_entries_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "waitlist_entries_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "waitlist_entries_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "waitlist_entries_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id"]
    },{
      foreignKeyName: "waitlist_entries_coaching_id_fkey"
      columns: ["coaching_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "waitlist_entries_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "waitlist_entries_slot_id_fkey"
      columns: ["slot_id"]
isOneToOne: false
      referencedRelation: "slots"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "waitlist_entries_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "waitlist_entries_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"week_template_items": {
                  Row: {
                    "allow_trial": boolean,"created_at": string,"duration_min": number,"end_time": string,"id": string,"iso_weekday": number,"location_id": string | null,"meeting_url": string | null,"mode": Database["public"]['Enums']["session_mode"],"start_time": string,"template_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allow_trial"?: boolean,"created_at"?: string,"duration_min": number,"end_time": string,"id"?: string,"iso_weekday": number,"location_id"?: string | null,"meeting_url"?: string | null,"mode"?: Database["public"]['Enums']["session_mode"],"start_time": string,"template_id": string,"updated_at"?: string
                  }
                  Update: {
                    "allow_trial"?: boolean,"created_at"?: string,"duration_min"?: number,"end_time"?: string,"id"?: string,"iso_weekday"?: number,"location_id"?: string | null,"meeting_url"?: string | null,"mode"?: Database["public"]['Enums']["session_mode"],"start_time"?: string,"template_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "week_template_items_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "week_template_items_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "week_templates"
      referencedColumns: ["id"]
    }
                  ]
                },"week_templates": {
                  Row: {
                    "buffer_min": number,"created_at": string,"generated_until": string | null,"horizon_weeks": number,"id": string,"is_active": boolean,"name": string,"time_zone": string,"trainer_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "buffer_min"?: number,"created_at"?: string,"generated_until"?: string | null,"horizon_weeks"?: number,"id"?: string,"is_active"?: boolean,"name": string,"time_zone": string,"trainer_id": string,"updated_at"?: string
                  }
                  Update: {
                    "buffer_min"?: number,"created_at"?: string,"generated_until"?: string | null,"horizon_weeks"?: number,"id"?: string,"is_active"?: boolean,"name"?: string,"time_zone"?: string,"trainer_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "week_templates_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"workout_log_exercises": {
                  Row: {
                    "created_at": string,"exercise_id": string,"id": string,"log_id": string,"notes": string | null,"position": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"exercise_id": string,"id"?: string,"log_id": string,"notes"?: string | null,"position": number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"exercise_id"?: string,"id"?: string,"log_id"?: string,"notes"?: string | null,"position"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workout_log_exercises_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_log_exercises_log_id_fkey"
      columns: ["log_id"]
isOneToOne: false
      referencedRelation: "workout_logs"
      referencedColumns: ["id"]
    }
                  ]
                },"workout_logs": {
                  Row: {
                    "booking_id": string | null,"client_id": string,"coaching_id": string | null,"created_at": string,"created_by": string | null,"duration_min": number | null,"id": string,"local_date": string,"notes": string | null,"performed_at": string,"template_id": string | null,"title": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_id"?: string | null,"client_id": string,"coaching_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"duration_min"?: number | null,"id"?: string,"local_date": string,"notes"?: string | null,"performed_at": string,"template_id"?: string | null,"title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "booking_id"?: string | null,"client_id"?: string,"coaching_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"duration_min"?: number | null,"id"?: string,"local_date"?: string,"notes"?: string | null,"performed_at"?: string,"template_id"?: string | null,"title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workout_logs_booking_fkey"
      columns: ["booking_id","coaching_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id","coaching_id"]
    },{
      foreignKeyName: "workout_logs_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: true
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_logs_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_logs_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_logs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_logs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_logs_pair_fkey"
      columns: ["coaching_id","client_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id","client_id"]
    },{
      foreignKeyName: "workout_logs_pair_fkey"
      columns: ["coaching_id","client_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id","client_id"]
    },{
      foreignKeyName: "workout_logs_pair_fkey"
      columns: ["coaching_id","client_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id","client_id"]
    },{
      foreignKeyName: "workout_logs_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "workout_templates"
      referencedColumns: ["id"]
    }
                  ]
                },"workout_sets": {
                  Row: {
                    "created_at": string,"distance_m": number | null,"duration_s": number | null,"id": string,"is_warmup": boolean,"log_exercise_id": string,"position": number,"reps": number | null,"rpe": number | null,"updated_at": string,"weight_kg": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"distance_m"?: number | null,"duration_s"?: number | null,"id"?: string,"is_warmup"?: boolean,"log_exercise_id": string,"position": number,"reps"?: number | null,"rpe"?: number | null,"updated_at"?: string,"weight_kg"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"distance_m"?: number | null,"duration_s"?: number | null,"id"?: string,"is_warmup"?: boolean,"log_exercise_id"?: string,"position"?: number,"reps"?: number | null,"rpe"?: number | null,"updated_at"?: string,"weight_kg"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "workout_sets_log_exercise_id_fkey"
      columns: ["log_exercise_id"]
isOneToOne: false
      referencedRelation: "workout_log_exercises"
      referencedColumns: ["id"]
    }
                  ]
                },"workout_template_items": {
                  Row: {
                    "created_at": string,"exercise_id": string,"id": string,"notes": string | null,"position": number,"rest_s": number | null,"target_duration_s": number | null,"target_reps": number | null,"target_sets": number | null,"target_weight_kg": number | null,"template_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"exercise_id": string,"id"?: string,"notes"?: string | null,"position": number,"rest_s"?: number | null,"target_duration_s"?: number | null,"target_reps"?: number | null,"target_sets"?: number | null,"target_weight_kg"?: number | null,"template_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"exercise_id"?: string,"id"?: string,"notes"?: string | null,"position"?: number,"rest_s"?: number | null,"target_duration_s"?: number | null,"target_reps"?: number | null,"target_sets"?: number | null,"target_weight_kg"?: number | null,"template_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workout_template_items_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_template_items_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "workout_templates"
      referencedColumns: ["id"]
    }
                  ]
                },"workout_templates": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"id": string,"notes": string | null,"owner_id": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"notes"?: string | null,"owner_id": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"notes"?: string | null,"owner_id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workout_templates_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_templates_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"workout_week_goals": {
                  Row: {
                    "client_id": string,"per_week": number,"set_by": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"per_week": number,"set_by"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "client_id"?: string,"per_week"?: number,"set_by"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workout_week_goals_client_id_fkey"
      columns: ["client_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_week_goals_client_id_fkey"
      columns: ["client_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_week_goals_set_by_fkey"
      columns: ["set_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_week_goals_set_by_fkey"
      columns: ["set_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "coaching_balances": {
                  Row: {
                    "available_sessions": number | null,"client_id": string | null,"coaching_id": string | null,"debt_amounts": Json | null,"debt_sessions": number | null,"trainer_id": string | null,"unpaid_amounts": Json | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "coachings_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coachings_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coachings_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"coaching_stats": {
                  Row: {
                    "attended_count": number | null,"client_id": string | null,"coaching_id": string | null,"last_attended_at": string | null,"late_cancel_count": number | null,"next_session_at": string | null,"no_show_count": number | null,"trainer_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "coachings_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coachings_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coachings_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"pass_balances": {
                  Row: {
                    "available": number | null,"client_id": string | null,"coaching_id": string | null,"currency": string | null,"effective_expires_at": string | null,"expires_at": string | null,"freeze_days": number | null,"frozen_today": boolean | null,"paid_minor": number | null,"pass_id": string | null,"price_minor": number | null,"remaining": number | null,"reserved_future": number | null,"sessions_total": number | null,"status": string | null,"title": string | null,"trainer_id": string | null,"unpaid_minor": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "passes_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "passes_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "passes_pair_fkey"
      columns: ["coaching_id","trainer_id","client_id"]
isOneToOne: false
      referencedRelation: "coaching_balances"
      referencedColumns: ["coaching_id","trainer_id","client_id"]
    },{
      foreignKeyName: "passes_pair_fkey"
      columns: ["coaching_id","trainer_id","client_id"]
isOneToOne: false
      referencedRelation: "coaching_stats"
      referencedColumns: ["coaching_id","trainer_id","client_id"]
    },{
      foreignKeyName: "passes_pair_fkey"
      columns: ["coaching_id","trainer_id","client_id"]
isOneToOne: false
      referencedRelation: "coachings"
      referencedColumns: ["id","trainer_id","client_id"]
    },{
      foreignKeyName: "passes_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"price_grid": {
                  Row: {
                    "applies_to": Database["public"]['Enums']["package_applies_to"] | null,"currency": string | null,"drop_in_package_id": string | null,"drop_in_price_minor": number | null,"is_best_value": boolean | null,"package_id": string | null,"per_session_minor": number | null,"price_minor": number | null,"savings_pct": number | null,"sessions_count": number | null,"title": string | null,"trainer_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "packages_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "trainer_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"public_profiles": {
                  Row: {
                    "avatar_path": string | null,"display_name": string | null,"id": string | null,"is_managed_card": boolean | null,"photo_url": string | null,"time_zone": string | null,"username": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "avatar_path"?: string | null,"display_name"?: never,"id"?: string | null,"is_managed_card"?: never,"photo_url"?: string | null,"time_zone"?: string | null,"username"?: string | null
                         }
                        Update: {
                           "avatar_path"?: string | null,"display_name"?: never,"id"?: string | null,"is_managed_card"?: never,"photo_url"?: string | null,"time_zone"?: string | null,"username"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"visible_personal_records": {
                  Row: {
                    "achieved_at": string | null,"client_id": string | null,"exercise_id": string | null,"record_type": Database["public"]['Enums']["pr_type"] | null,"set_id": string | null,"value": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "workout_log_exercises_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_logs_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_logs_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "accept_contact_request":
{ Args: { "p_phone": string,"p_request_id": string,"p_user": string }; Returns: Database["public"]['Enums']["contact_request_status"]
                           },
"accept_delegation":
{ Args: { "p_token": string }; Returns: string
                           },
"accept_waitlist_offer":
{ Args: { "p_entry_id": string }; Returns: {
              "booking_id": string,"status": Database["public"]['Enums']["booking_status"]
            }[]
                           },
"add_food_comment":
{ Args: { "p_body": string,"p_coaching_id": string,"p_day": string }; Returns: string
                           },
"add_food_entry":
{ Args: { "p_carbs"?: number,"p_day": string,"p_fat"?: number,"p_food_id"?: string,"p_grams"?: number,"p_kcal"?: number,"p_meal": Database["public"]['Enums']["meal_type"],"p_protein"?: number,"p_servings"?: number,"p_title"?: string }; Returns: string
                           },
"add_group_member":
{ Args: { "p_coaching_id": string,"p_group_id": string,"p_make_primary"?: boolean }; Returns: boolean
                           },
"add_group_participant":
{ Args: { "p_coaching_id": string,"p_session_id": string }; Returns: string
                           },
"add_group_participant_extra":
{ Args: { "p_coaching_id": string,"p_session_id": string }; Returns: string
                           },
"add_water":
{ Args: { "p_day": string,"p_ml": number }; Returns: string
                           },
"adjust_pass":
{ Args: { "p_delta": number,"p_note": string,"p_pass_id": string }; Returns: string
                           },
"admin_analytics_clients":
{ Args: { "p_days"?: number,"p_limit"?: number }; Returns: {
              "adds_photos": boolean,"attended": number,"client_id": string,"first_name": string,"has_target": boolean,"keeps_diary": boolean,"last_active": string,"last_name": string,"logs_activity": boolean,"logs_workouts": boolean,"pairs": number,"takes_measurements": boolean,"username": string
            }[]
                           },
"admin_analytics_platform":
{ Args: { "p_days"?: number }; Returns: {
              "active_30": number,"active_7": number,"bookings": number,"cancellations": number,"cards": number,"clients": number,"clients_keeping_diary": number,"clients_logging_activity": number,"clients_logging_workouts": number,"clients_with_measurements": number,"clients_with_photos": number,"clients_with_target": number,"held_sessions": number,"held_without_edits": number,"invites_created": number,"no_shows": number,"opens": number,"opens_from_bot": number,"sessions": number,"trainers_registered": number,"trainers_verified": number,"trainers_with_client": number,"trainers_with_session": number
            }[]
                           },
"admin_analytics_trainer":
{ Args: { "p_days"?: number,"p_trainer_id": string }; Returns: {
              "attended": number,"clients": number,"earned": Json,"ending_passes": number,"first_name": string,"held_sessions": number,"last_active": string,"last_name": string,"no_shows": number,"opens": number,"received": Json,"trainer_id": string,"username": string,"uses_groups": boolean,"uses_passes": boolean,"uses_repeats": boolean,"uses_workout_templates": boolean,"verification_status": Database["public"]['Enums']["verification_status"],"weeks": (number)[]
            }[]
                           },
"admin_analytics_trainers":
{ Args: { "p_days"?: number }; Returns: {
              "attended": number,"clients": number,"earned": Json,"ending_passes": number,"first_name": string,"held_sessions": number,"last_active": string,"last_name": string,"no_shows": number,"opens": number,"received": Json,"trainer_id": string,"username": string,"uses_groups": boolean,"uses_passes": boolean,"uses_repeats": boolean,"uses_workout_templates": boolean,"verification_status": Database["public"]['Enums']["verification_status"]
            }[]
                           },
"admin_beta_metrics":
{ Args: Record<PropertyKey, never>; Returns: {
              "held_sessions": number,"held_without_edits": number,"opens": number,"opens_from_bot": number,"opens_from_bot_prev": number,"trainers_on_schedule": number,"trainers_total": number
            }[]
                           },
"admin_block_user":
{ Args: { "p_reason": string,"p_user_id": string }; Returns: undefined
                           },
"admin_create_trainer_invite":
{ Args: { "p_note"?: string,"p_valid_days"?: number }; Returns: {
              "code": string,"expires_at": string,"invite_id": string
            }[]
                           },
"admin_decide_report":
{ Args: { "p_hide": boolean,"p_reason": string,"p_report_id": string }; Returns: undefined
                           },
"admin_decide_review_dispute":
{ Args: { "p_hide": boolean,"p_reason"?: string,"p_report_id": string }; Returns: undefined
                           },
"admin_decide_verification":
{ Args: { "p_decision": Database["public"]['Enums']["verification_status"],"p_reason"?: string,"p_trainer_id": string }; Returns: undefined
                           },
"admin_decline_access_request":
{ Args: { "p_request_id": string }; Returns: undefined
                           },
"admin_dismiss_report":
{ Args: { "p_reason": string,"p_report_id": string }; Returns: undefined
                           },
"admin_grant_plan":
{ Args: { "p_expires_at"?: string,"p_plan_code": string,"p_reason": string,"p_user_id": string }; Returns: string
                           },
"admin_grant_referral_bonus":
{ Args: { "p_bonus_id": string,"p_starts_on": string }; Returns: string
                           },
"admin_open_break_glass":
{ Args: { "p_categories": (Database["public"]['Enums']["share_category"])[],"p_minutes"?: number,"p_reason": string,"p_target_user": string }; Returns: string
                           },
"admin_overview":
{ Args: Record<PropertyKey, never>; Returns: {
              "active_invites": number,"active_pairs": number,"blocked_users": number,"trainers": number,"trainers_pending": number,"trainers_verified": number,"users": number
            }[]
                           },
"admin_owner_cohorts":
{ Args: { "p_weeks"?: number }; Returns: {
              "cohort_week": string,"retained": (number)[],"size": number
            }[]
                           },
"admin_owner_sources":
{ Args: Record<PropertyKey, never>; Returns: {
              "campaign": string,"clients": number,"source": string,"trainers": number,"users": number
            }[]
                           },
"admin_owner_success":
{ Args: Record<PropertyKey, never>; Returns: {
              "clients": number,"clients_with_streak": number,"trainers": number,"trainers_offer_ever": number,"trainers_offer_live": number
            }[]
                           },
"admin_owner_summary":
{ Args: Record<PropertyKey, never>; Returns: {
              "attended": number,"bookings": number,"cards": number,"client_referrals": number,"client_referrals_qualified": number,"clients": number,"clients_active_30": number,"clients_active_7": number,"dau": number,"held_sessions": number,"joins_by_source": Json,"mau": number,"pairs": number,"passes_sold": number,"trainer_invites_created": number,"trainer_invites_redeemed": number,"trainer_referrals": number,"trainers": number,"trainers_active_30": number,"trainers_active_7": number,"trainers_verified": number,"turnover": Json,"turnover_30": Json,"users": number,"wau": number
            }[]
                           },
"admin_owner_weekly":
{ Args: { "p_weeks"?: number }; Returns: {
              "active_clients": number,"active_trainers": number,"active_users": number,"attended": number,"bookings": number,"held_sessions": number,"new_pairs": number,"new_trainers": number,"new_users": number,"passes_sold": number,"referrals": number,"trainer_invites_created": number,"trainer_invites_redeemed": number,"turnover": Json,"week_start": string
            }[]
                           },
"admin_reply_feedback":
{ Args: { "p_body": string,"p_feedback_id": string }; Returns: string
                           },
"admin_revoke_plan":
{ Args: { "p_grant_id": string,"p_reason": string }; Returns: undefined
                           },
"admin_revoke_trainer_invite":
{ Args: { "p_invite_id": string }; Returns: undefined
                           },
"admin_search_users":
{ Args: { "p_limit"?: number,"p_query"?: string }; Returns: {
              "blocked": boolean,"created_at": string,"first_name": string,"is_admin": boolean,"is_trainer": boolean,"last_name": string,"photo_url": string,"telegram_id": number,"user_id": string,"username": string
            }[]
                           },
"admin_set_trainer_honor":
{ Args: { "p_honor": Database["public"]['Enums']["trainer_honor"],"p_on": boolean,"p_reason": string,"p_trainer_id": string }; Returns: undefined
                           },
"admin_set_trainer_referral_bonus":
{ Args: { "p_discount_percent"?: number,"p_kind": Database["public"]['Enums']["bonus_kind"] }; Returns: undefined
                           },
"admin_trainer_honors":
{ Args: { "p_trainer_id": string }; Returns: {
              "granted_at": string,"honor": Database["public"]['Enums']["trainer_honor"],"reason": string
            }[]
                           },
"admin_trainer_referral_bonuses":
{ Args: Record<PropertyKey, never>; Returns: {
              "active_weeks": number,"bonus_id": string,"bonus_kind": Database["public"]['Enums']["bonus_kind"],"bonus_status": Database["public"]['Enums']["bonus_status"],"discount_percent": number,"due": boolean,"granted_at": string,"invited_at": string,"plan_expires_at": string,"plan_starts_at": string,"referee_first_name": string,"referee_id": string,"referee_last_name": string,"referee_username": string,"referral_status": Database["public"]['Enums']["referral_status"],"referrer_first_name": string,"referrer_id": string,"referrer_last_name": string,"referrer_username": string
            }[]
                           },
"admin_trainer_referrers":
{ Args: Record<PropertyKey, never>; Returns: {
              "active": number,"bonuses_granted": number,"bonuses_pending": number,"first_name": string,"invited": number,"last_name": string,"trainer_id": string,"username": string
            }[]
                           },
"admin_unblock_user":
{ Args: { "p_reason": string,"p_user_id": string }; Returns: undefined
                           },
"admin_user_card":
{ Args: { "p_user_id": string }; Returns: {
              "blocked_at": string,"blocked_reason": string,"bookings_made": number,"client_active_pairs": number,"client_pairs": number,"created_at": string,"first_name": string,"is_admin": boolean,"is_trainer": boolean,"language_code": string,"last_name": string,"last_seen_at": string,"photo_url": string,"sessions_led": number,"telegram_id": number,"trainer_active_pairs": number,"trainer_pairs": number,"user_id": string,"username": string,"verification_status": Database["public"]['Enums']["verification_status"]
            }[]
                           },
"appeal_report":
{ Args: { "p_body": string,"p_report_id": string }; Returns: string
                           },
"archive_food":
{ Args: { "p_id": string }; Returns: boolean
                           },
"archive_homework":
{ Args: { "p_homework": string }; Returns: undefined
                           },
"book_group_session":
{ Args: { "p_session_id": string }; Returns: {
              "booking_id": string,"status": Database["public"]['Enums']["booking_status"]
            }[]
                           },
"book_slot":
{ Args: { "p_slot_id": string }; Returns: {
              "booking_id": string,"status": Database["public"]['Enums']["booking_status"]
            }[]
                           },
"book_trial":
{ Args: { "p_slot_id": string,"p_token": string }; Returns: {
              "booking_id": string,"coaching_id": string
            }[]
                           },
"bookable_group_sessions":
{ Args: { "p_from": string,"p_trainer_id": string,"p_until": string }; Returns: {
              "capacity": number,"ends_at": string,"location_id": string,"mode": Database["public"]['Enums']["session_mode"],"my_booking_id": string,"my_waitlist_id": string,"my_waitlist_place": number,"my_waitlist_status": Database["public"]['Enums']["waitlist_status"],"session_id": string,"starts_at": string,"taken": number,"title": string
            }[]
                           },
"booking_preview":
{ Args: { "p_slot_id": string }; Returns: {
              "confirmed": boolean,"pass_title": string,"sessions_left": number
            }[]
                           },
"bot_messages_blocked":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"broadcast_history":
{ Args: { "p_group_id": string }; Returns: {
              "body": string,"button_kind": string,"button_url": string,"created_at": string,"deferred": number,"id": string,"muted": number,"recipients": number,"sent": number,"undelivered": number
            }[]
                           },
"broadcasts_today":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"cache_off_foods":
{ Args: { "p_items": Json }; Returns: {
              "id": string,"off_code": string
            }[]
                           },
"calculate_nutrition_target":
{ Args: { "p_weight_kg": number }; Returns: Json
                           },
"calendar_feed":
{ Args: { "p_token": string }; Returns: Json
                           },
"cancel_account_deletion":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"cancel_challenge":
{ Args: { "p_challenge_id": string }; Returns: undefined
                           },
"cancel_my_booking":
{ Args: { "p_booking_id": string,"p_late"?: boolean,"p_reason"?: string }; Returns: Database["public"]['Enums']["booking_status"]
                           },
"cancel_participant":
{ Args: { "p_booking_id": string,"p_reason": string }; Returns: undefined
                           },
"cancel_pass":
{ Args: { "p_pass_id": string,"p_reason": string }; Returns: undefined
                           },
"cancel_preview":
{ Args: { "p_booking_id": string }; Returns: {
              "charged": boolean,"currency": string,"debt_minor": number,"late": boolean,"pass_title": string,"sessions_left": number
            }[]
                           },
"cancel_session":
{ Args: { "p_following"?: boolean,"p_reason": string,"p_session_id": string }; Returns: number
                           },
"challenge_board":
{ Args: { "p_challenge_id": string }; Returns: {
              "alias": string,"hidden": boolean,"is_me": boolean,"name": string,"photo_url": string,"place": number,"report_id": string,"score": number,"shown": boolean
            }[]
                           },
"change_pass_expiry":
{ Args: { "p_last_day": string,"p_pass_id": string,"p_reason": string }; Returns: undefined
                           },
"check_in_by_location":
{ Args: { "p_token": string }; Returns: {
              "booking_id": string,"opens_at": string,"outcome": string
            }[]
                           },
"check_in_by_qr":
{ Args: { "p_code": string,"p_session_id": string }; Returns: {
              "booking_id": string,"opens_at": string,"outcome": string
            }[]
                           },
"choose_nutrition_target":
{ Args: { "p_coaching_id": string }; Returns: undefined
                           },
"claim_data_exports":
{ Args: { "p_limit"?: number }; Returns: {
              "id": string,"user_id": string
            }[]
                           },
"claim_outbox":
{ Args: { "p_limit"?: number }; Returns: {
              "attempt": number,"chat_id": number,"chat_target": string,"kind": Database["public"]['Enums']["notification_type"],"locale": Database["public"]['Enums']["app_locale"],"outbox_id": number,"payload": Json,"silent": boolean,"time_zone": string
            }[]
                           },
"clear_group_target":
{ Args: { "p_group_id": string }; Returns: undefined
                           },
"clear_nutrition_target":
{ Args: { "p_coaching_id": string }; Returns: boolean
                           },
"client_referral":
{ Args: { "p_coaching_id": string }; Returns: {
              "active_to": string,"code": string,"currency": string,"friends": Json,"min_amount_minor": number,"package_title": string,"referee_sessions": number,"referrer_sessions": number
            }[]
                           },
"close_schedule_days":
{ Args: { "p_from": string,"p_to": string,"p_trainer_id"?: string }; Returns: {
              "session_id": string,"starts_at": string,"title": string
            }[]
                           },
"complete_data_export":
{ Args: { "p_id": string,"p_storage_path": string }; Returns: undefined
                           },
"copy_food_meal":
{ Args: { "p_from": string,"p_meal": Database["public"]['Enums']["meal_type"],"p_to": string,"p_to_meal"?: Database["public"]['Enums']["meal_type"] }; Returns: number
                           },
"correct_payment":
{ Args: { "p_amount_minor": number,"p_method": Database["public"]['Enums']["payment_method"],"p_paid_at": string,"p_payment_id": string,"p_reason": string }; Returns: string
                           },
"create_calendar_feed":
{ Args: { "p_zone": Database["public"]['Enums']["app_zone"] }; Returns: string
                           },
"create_challenge":
{ Args: { "p_goal"?: number,"p_group_id": string,"p_leaderboard"?: boolean,"p_metric": string,"p_starts_on": string,"p_title": string,"p_weeks": number }; Returns: string
                           },
"create_delegation":
{ Args: { "p_all_clients"?: boolean,"p_coaching_ids"?: (string)[],"p_ends_at"?: string,"p_kind": Database["public"]['Enums']["delegation_kind"],"p_scopes"?: (Database["public"]['Enums']["delegation_scope"])[],"p_session_id"?: string }; Returns: {
              "delegation_id": string,"token": string
            }[]
                           },
"create_group_session":
{ Args: { "p_capacity": number,"p_count"?: number,"p_duration_min": number,"p_location_id"?: string,"p_meeting_url"?: string,"p_mode": Database["public"]['Enums']["session_mode"],"p_open_for_booking"?: boolean,"p_starts_at": string,"p_title": string,"p_trainer_id"?: string,"p_until"?: string,"p_weekdays"?: (number)[] }; Returns: {
              "created": number,"session_id": string
            }[]
                           },
"create_managed_client":
{ Args: { "p_contact"?: string,"p_display_name": string,"p_note"?: string }; Returns: string
                           },
"create_pass":
{ Args: { "p_applies_to"?: Database["public"]['Enums']["package_applies_to"],"p_coaching_id": string,"p_currency"?: string,"p_note"?: string,"p_package_id"?: string,"p_paid_at"?: string,"p_payment_method"?: Database["public"]['Enums']["payment_method"],"p_payment_minor"?: number,"p_price_minor"?: number,"p_sessions"?: number,"p_starts_on"?: string,"p_title"?: string,"p_validity_days"?: number }; Returns: {
              "pass_id": string,"settled": number
            }[]
                           },
"create_session":
{ Args: { "p_coaching_id": string,"p_count"?: number,"p_duration_min": number,"p_location_id"?: string,"p_meeting_url"?: string,"p_mode": Database["public"]['Enums']["session_mode"],"p_starts_at": string,"p_title"?: string,"p_until"?: string,"p_weekdays"?: (number)[] }; Returns: {
              "created": number,"session_id": string
            }[]
                           },
"create_story_card":
{ Args: { "p_coaching"?: string,"p_confirm"?: boolean,"p_kind": string,"p_month": string }; Returns: string
                           },
"create_substitutions":
{ Args: { "p_session_ids": (string)[] }; Returns: {
              "delegation_id": string,"token": string
            }[]
                           },
"decide_booking":
{ Args: { "p_accept": boolean,"p_booking_id": string,"p_reason"?: string,"p_single"?: boolean,"p_single_title"?: string }; Returns: Database["public"]['Enums']["booking_status"]
                           },
"decline_contact_request":
{ Args: { "p_request_id": string }; Returns: Database["public"]['Enums']["contact_request_status"]
                           },
"decline_delegation":
{ Args: { "p_token": string }; Returns: undefined
                           },
"decline_referral":
{ Args: { "p_referral_id": string }; Returns: undefined
                           },
"delegate_journal":
{ Args: { "p_coaching_id"?: string }; Returns: {
              "action": string,"at": string,"booking_id": string,"coaching_id": string,"delegate_name": string,"owner_name": string,"workout_log_id": string
            }[]
                           },
"delegated_session":
{ Args: { "p_session_id": string }; Returns: {
              "ends_at": string,"id": string,"kind": Database["public"]['Enums']["session_kind"],"location": string,"mode": Database["public"]['Enums']["session_mode"],"owner_name": string,"participants": Json,"starts_at": string,"title": string
            }[]
                           },
"delegation_invite":
{ Args: { "p_token": string }; Returns: {
              "all_clients": boolean,"clients": number,"ends_at": string,"kind": Database["public"]['Enums']["delegation_kind"],"owner_name": string,"scopes": (Database["public"]['Enums']["delegation_scope"])[],"session_starts_at": string,"sessions_starts_at": (string)[]
            }[]
                           },
"delete_food_comment":
{ Args: { "p_id": string }; Returns: boolean
                           },
"delete_review":
{ Args: { "p_coaching_id": string }; Returns: boolean
                           },
"dispute_review":
{ Args: { "p_body"?: string,"p_reason": string,"p_review_id": string }; Returns: string
                           },
"edit_food_comment":
{ Args: { "p_body": string,"p_id": string }; Returns: boolean
                           },
"effective_plan":
{ Args: { "p_side": Database["public"]['Enums']["plan_side"],"p_user": string }; Returns: string
                           },
"end_coaching":
{ Args: { "p_coaching_id": string,"p_reason"?: string }; Returns: number
                           },
"fail_data_export":
{ Args: { "p_id": string }; Returns: undefined
                           },
"food_by_barcode":
{ Args: { "p_barcode": string }; Returns: {
              "archived_at": string | null,
"barcode": string | null,
"brand": string | null,
"carbs_100g": number | null,
"created_at": string,
"fat_100g": number | null,
"id": string,
"kcal_100g": number,
"kind": Database["public"]['Enums']["food_kind"],
"lang": string | null,
"name": string,
"off_code": string | null,
"off_fetched_at": string | null,
"owner_id": string | null,
"protein_100g": number | null,
"serving_g": number | null,
"serving_label": string | null,
"source": Database["public"]['Enums']["food_source"],
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "foods"
        isOneToOne: false
        isSetofReturn: true
      } },
"get_managed_client_claim":
{ Args: { "p_claim_id": string }; Returns: Json
                           },
"get_showcase_terms":
{ Args: { "p_slug": string }; Returns: {
              "accepted_at": string,"bans": (string)[],"condition": string
            }[]
                           },
"get_showcase_trial":
{ Args: { "p_slug": string }; Returns: string
                           },
"get_trainer_honors":
{ Args: { "p_slug": string }; Returns: Database["public"]['Enums']["trainer_honor"][]
                           },
"get_trainer_showcase":
{ Args: { "p_slug": string }; Returns: {
              "bio": string,"city": string,"coaching_id": string,"headline": string,"is_own": boolean,"locations": Json,"name": string,"photo_url": string,"slug": string,"specialties": (string)[],"status": string,"verified": boolean,"works_offline": boolean,"works_online": boolean
            }[]
                           },
"get_trainer_showcase_prices":
{ Args: { "p_slug": string }; Returns: {
              "applies_to": Database["public"]['Enums']["package_applies_to"],"currency": string,"is_best_value": boolean,"per_session_minor": number,"price_minor": number,"savings_pct": number,"sessions_count": number,"title": string,"validity_days": number
            }[]
                           },
"get_trial_link":
{ Args: { "p_token": string }; Returns: {
              "coaching_id": string,"currency": string,"description": string,"duration_min": number,"headline": string,"location_address": string,"location_name": string,"mode": Database["public"]['Enums']["session_mode"],"name": string,"photo_url": string,"price_minor": number,"specialties": (string)[],"status": string,"time_zone": string,"title": string,"trainer_id": string,"verified": boolean,"works_offline": boolean,"works_online": boolean
            }[]
                           },
"get_trial_slots":
{ Args: { "p_token": string }; Returns: {
              "ends_at": string,"location_name": string,"mode": Database["public"]['Enums']["session_mode"],"slot_id": string,"starts_at": string
            }[]
                           },
"give_public_data_consent":
{ Args: { "p_bans"?: (string)[],"p_condition"?: string,"p_fields"?: (string)[],"p_location_ids"?: (string)[],"p_scope": string,"p_version": string }; Returns: string
                           },
"group_analytics":
{ Args: { "p_group_id": string }; Returns: {
              "adherence": number,"adherence_clients": number,"attendance": number,"attendance_clients": number,"members": number,"weight_change_kg": number,"weight_clients": number
            }[]
                           },
"group_booking_preview":
{ Args: { "p_session_id": string }; Returns: {
              "confirmed": boolean,"pass_title": string,"sessions_left": number
            }[]
                           },
"group_target_impact":
{ Args: { "p_group_id": string }; Returns: number
                           },
"has_entitlement":
{ Args: { "p_feature": string,"p_pair"?: string,"p_user": string }; Returns: boolean
                           },
"hide_food_comment":
{ Args: { "p_hidden"?: boolean,"p_id": string }; Returns: boolean
                           },
"homework_today":
{ Args: { "p_coaching": string }; Returns: string
                           },
"ingest_steps":
{ Args: { "p_day"?: string,"p_steps": number,"p_token": string }; Returns: string
                           },
"invite_delegate":
{ Args: { "p_delegation_id": string,"p_trainer_id": string }; Returns: undefined
                           },
"issue_ingest_token":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"join_by_code":
{ Args: { "p_code": string }; Returns: string
                           },
"join_by_invite":
{ Args: { "p_token": string }; Returns: string
                           },
"join_by_referral":
{ Args: { "p_code": string }; Returns: string
                           },
"join_by_showcase":
{ Args: { "p_slug": string }; Returns: string
                           },
"join_by_trial_link":
{ Args: { "p_token": string }; Returns: string
                           },
"join_challenge":
{ Args: { "p_alias"?: string,"p_challenge_id": string,"p_show_on_leaderboard"?: boolean }; Returns: undefined
                           },
"join_invited_trainer":
{ Args: { "p_trainer_id": string }; Returns: string
                           },
"join_slot_waitlist":
{ Args: { "p_slot_id": string }; Returns: {
              "entry_id": string,"place": number
            }[]
                           },
"join_trainer_waitlist":
{ Args: { "p_clients"?: string,"p_consent_version": string,"p_contact"?: string,"p_locale": string,"p_name": string,"p_source"?: string }; Returns: undefined
                           },
"join_waitlist":
{ Args: { "p_session_id": string }; Returns: {
              "entry_id": string,"place": number
            }[]
                           },
"last_exercise_results":
{ Args: { "p_before"?: string,"p_client": string,"p_exercises": (string)[] }; Returns: {
              "exercise_id": string,"log_id": string,"performed_at": string,"sets": Json
            }[]
                           },
"leave_challenge":
{ Args: { "p_challenge_id": string }; Returns: undefined
                           },
"leave_waitlist":
{ Args: { "p_entry_id": string }; Returns: undefined
                           },
"location_check_in_token":
{ Args: { "p_location_id": string,"p_renew"?: boolean }; Returns: string
                           },
"make_booking_single":
{ Args: { "p_booking_id": string,"p_title": string }; Returns: string
                           },
"mark_attendance":
{ Args: { "p_booking_id": string,"p_reason"?: string,"p_status": Database["public"]['Enums']["booking_status"] }; Returns: Database["public"]['Enums']["booking_status"]
                           },
"mark_badges_seen":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"mark_homework_done":
{ Args: { "p_comment"?: string,"p_log"?: string,"p_occurrence": string }; Returns: string
                           },
"my_app_opens_counted":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"my_challenges":
{ Args: Record<PropertyKey, never>; Returns: {
              "alias": string,"coaching_id": string,"ends_on": string,"goal": number,"id": string,"joined": boolean,"leaderboard": boolean,"metric": string,"score": number,"shared": boolean,"show_on_leaderboard": boolean,"starts_on": string,"state": string,"title": string,"trainer_name": string
            }[]
                           },
"my_client_invite":
{ Args: Record<PropertyKey, never>; Returns: {
              "code": string,"created_at": string,"invite_id": string,"token": string,"uses_count": number
            }[]
                           },
"my_delegations":
{ Args: Record<PropertyKey, never>; Returns: {
              "accepted_at": string,"all_clients": boolean,"clients": number,"created_at": string,"ends_at": string,"id": string,"kind": Database["public"]['Enums']["delegation_kind"],"other_id": string,"other_name": string,"scopes": (Database["public"]['Enums']["delegation_scope"])[],"session_id": string,"session_starts_at": string,"side": string,"starts_at": string,"status": Database["public"]['Enums']["delegation_status"]
            }[]
                           },
"my_groups":
{ Args: Record<PropertyKey, never>; Returns: {
              "broadcasts_muted": boolean,"coaching_id": string,"color": string,"goal": Database["public"]['Enums']["goal_type"],"group_id": string,"name": string,"trainer_name": string
            }[]
                           },
"my_inherited_rights":
{ Args: Record<PropertyKey, never>; Returns: {
              "coaching_id": string,"first_name": string,"last_name": string,"trainer_id": string,"username": string
            }[]
                           },
"my_invited_trainers":
{ Args: Record<PropertyKey, never>; Returns: {
              "available": boolean,"coaching_id": string,"first_name": string,"joined_at": string,"last_name": string,"photo_url": string,"trainer_id": string
            }[]
                           },
"my_monthly_report":
{ Args: { "p_month": string }; Returns: Json
                           },
"my_monthly_report_shares":
{ Args: { "p_month": string }; Returns: Json
                           },
"my_nutrition_target":
{ Args: Record<PropertyKey, never>; Returns: {
              "calc_inputs": Json,"carbs_g": number,"coaching_id": string,"effective_from": string,"fat_g": number,"group_name": string,"id": string,"kcal": number,"protein_g": number,"source": Database["public"]['Enums']["target_source"],"trainer_name": string
            }[]
                           },
"my_pair_delegates":
{ Args: Record<PropertyKey, never>; Returns: {
              "coaching_id": string,"delegate_name": string,"ends_at": string,"kind": Database["public"]['Enums']["delegation_kind"],"progress_blocked": boolean,"session_starts_at": string
            }[]
                           },
"my_plan":
{ Args: Record<PropertyKey, never>; Returns: {
              "active_clients": number,"client_limit": number,"expires_at": string,"plan_code": string,"side": Database["public"]['Enums']["plan_side"]
            }[]
                           },
"my_report_decisions":
{ Args: Record<PropertyKey, never>; Returns: {
              "appealed": boolean,"report_id": string,"resolution_note": string,"resolved_at": string,"status": Database["public"]['Enums']["report_status"],"target_id": string,"target_type": Database["public"]['Enums']["report_target"]
            }[]
                           },
"my_session_substitutes":
{ Args: { "p_session_ids": (string)[] }; Returns: {
              "name": string,"session_id": string
            }[]
                           },
"my_streaks":
{ Args: Record<PropertyKey, never>; Returns: {
              "diary": number,"steps": number,"week_done": number,"week_goal": number,"workouts": number
            }[]
                           },
"my_trainer_inviter_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"my_trainer_referral":
{ Args: Record<PropertyKey, never>; Returns: {
              "code": string,"trainers": Json
            }[]
                           },
"nutrition_adherence":
{ Args: { "p_client_id": string,"p_days": number }; Returns: {
              "adherence": number,"counted": number,"days": number,"has_target": boolean,"in_norm": number,"logged": number,"previous_adherence": number
            }[]
                           },
"nutrition_target_on":
{ Args: { "p_client_id": string,"p_day": string }; Returns: {
              "carbs_g": number,"fat_g": number,"kcal": number,"other_trainer": boolean,"protein_g": number,"source": Database["public"]['Enums']["target_source"]
            }[]
                           },
"pair_nutrition_state":
{ Args: { "p_coaching_id": string }; Returns: string
                           },
"pair_streaks":
{ Args: { "p_coaching": string }; Returns: {
              "diary": number,"steps": number,"week_done": number,"week_goal": number,"workouts": number
            }[]
                           },
"purge_account":
{ Args: { "p_user": string }; Returns: (string)[]
                           },
"purge_health_data":
{ Args: { "p_user": string }; Returns: boolean
                           },
"rate_limit_hit":
{ Args: { "p_bucket": string,"p_limit": number,"p_subject": string,"p_window_seconds": number }; Returns: boolean
                           },
"record_app_open":
{ Args: { "p_source"?: string }; Returns: undefined
                           },
"record_outbox_result":
{ Args: { "p_error"?: string,"p_id": number,"p_outcome": string,"p_retry_after_s"?: number,"p_telegram_message_id"?: number }; Returns: Database["public"]['Enums']["outbox_status"]
                           },
"record_past_session":
{ Args: { "p_coaching_id": string,"p_duration_min": number,"p_location_id"?: string,"p_mode": Database["public"]['Enums']["session_mode"],"p_starts_at": string,"p_status"?: Database["public"]['Enums']["booking_status"],"p_title"?: string }; Returns: {
              "booking_id": string,"session_id": string
            }[]
                           },
"recurrence_meeting_url":
{ Args: { "p_recurrence_id": string }; Returns: string
                           },
"redeem_trainer_invite":
{ Args: { "p_code": string }; Returns: undefined
                           },
"reissue_client_invite":
{ Args: Record<PropertyKey, never>; Returns: {
              "code": string,"created_at": string,"invite_id": string,"token": string,"uses_count": number
            }[]
                           },
"remind_intake":
{ Args: { "p_coaching_id": string }; Returns: boolean
                           },
"reopen_schedule":
{ Args: { "p_slot_id": string }; Returns: number
                           },
"replace_progress_photo":
{ Args: { "p_blur_method": string,"p_face_blurred": boolean,"p_height": number,"p_new_id": string,"p_note"?: string,"p_photo_id": string,"p_storage_path": string,"p_width": number }; Returns: string
                           },
"reply_to_review":
{ Args: { "p_body": string,"p_review_id": string }; Returns: undefined
                           },
"report_content":
{ Args: { "p_body"?: string,"p_reason": string,"p_target_id": string,"p_target_type": Database["public"]['Enums']["report_target"] }; Returns: string
                           },
"report_showcase_public":
{ Args: { "p_body"?: string,"p_contact"?: string,"p_reason": string,"p_slug": string }; Returns: string
                           },
"request_access":
{ Args: { "p_feature"?: string,"p_plan_code": string }; Returns: string
                           },
"request_account_deletion":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"request_contact":
{ Args: { "p_coaching_id": string }; Returns: string
                           },
"request_data_export":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"reschedule_my_booking":
{ Args: { "p_booking_id": string,"p_slot_id": string }; Returns: {
              "booking_id": string,"status": Database["public"]['Enums']["booking_status"]
            }[]
                           },
"reschedule_preview":
{ Args: { "p_booking_id": string,"p_slot_id": string }; Returns: {
              "confirmed": boolean,"pass_title": string,"sessions_left": number
            }[]
                           },
"resolve_client_invite":
{ Args: { "p_code"?: string,"p_token"?: string }; Returns: {
              "coaching_id": string,"first_name": string,"headline": string,"last_name": string,"photo_url": string,"specialties": (string)[],"status": string,"trainer_id": string,"verified": boolean,"works_offline": boolean,"works_online": boolean
            }[]
                           },
"resolve_managed_client_claim":
{ Args: { "p_claim_id": string,"p_managed_client_id"?: string }; Returns: string
                           },
"resolve_referral":
{ Args: { "p_code": string }; Returns: {
              "coaching_id": string,"first_name": string,"headline": string,"last_name": string,"photo_url": string,"referee_sessions": number,"referrer_first_name": string,"specialties": (string)[],"status": string,"trainer_id": string,"verified": boolean,"works_offline": boolean,"works_online": boolean
            }[]
                           },
"review_eligibility":
{ Args: { "p_coaching_id": string }; Returns: {
              "attended": number,"eligible": boolean
            }[]
                           },
"revoke_calendar_feed":
{ Args: { "p_zone": Database["public"]['Enums']["app_zone"] }; Returns: boolean
                           },
"revoke_delegation":
{ Args: { "p_delegation_id": string }; Returns: boolean
                           },
"revoke_ingest_token":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"revoke_public_data_consent":
{ Args: { "p_scope": string }; Returns: boolean
                           },
"save_calculator_target":
{ Args: { "p_weight_kg": number }; Returns: string
                           },
"save_dish":
{ Args: { "p_id": string,"p_items": Json,"p_name": string,"p_total_g"?: number }; Returns: string
                           },
"save_food":
{ Args: { "p_barcode"?: string,"p_brand"?: string,"p_carbs"?: number,"p_fat"?: number,"p_id": string,"p_kcal": number,"p_name": string,"p_protein"?: number,"p_serving_g"?: number,"p_serving_label"?: string }; Returns: string
                           },
"save_homework":
{ Args: { "p_homework": Json }; Returns: string
                           },
"save_referral_offer":
{ Args: { "p_active_to"?: string,"p_currency"?: string,"p_min_amount_minor"?: number,"p_package_id"?: string,"p_referee_sessions"?: number,"p_referrer_sessions": number }; Returns: string
                           },
"save_review":
{ Args: { "p_body"?: string,"p_coaching_id": string,"p_rating": number }; Returns: string
                           },
"save_week_template":
{ Args: { "p_buffer_min"?: number,"p_horizon_weeks"?: number,"p_items": Json,"p_trainer_id"?: string }; Returns: number
                           },
"save_workout_log":
{ Args: { "p_log": Json }; Returns: string
                           },
"save_workout_template":
{ Args: { "p_template": Json }; Returns: string
                           },
"search_delegate_trainers":
{ Args: { "p_query": string }; Returns: {
              "name": string,"trainer_id": string,"username": string
            }[]
                           },
"search_exercises":
{ Args: { "p_category"?: string,"p_limit"?: number,"p_locale"?: Database["public"]['Enums']["app_locale"],"p_offset"?: number,"p_own_only"?: boolean,"p_query"?: string }; Returns: {
              "category": string,"equipment": (string)[],"id": string,"name": string,"own": boolean,"source": Database["public"]['Enums']["exercise_source"]
            }[]
                           },
"search_foods":
{ Args: { "p_limit"?: number,"p_query": string }; Returns: {
              "archived_at": string | null,
"barcode": string | null,
"brand": string | null,
"carbs_100g": number | null,
"created_at": string,
"fat_100g": number | null,
"id": string,
"kcal_100g": number,
"kind": Database["public"]['Enums']["food_kind"],
"lang": string | null,
"name": string,
"off_code": string | null,
"off_fetched_at": string | null,
"owner_id": string | null,
"protein_100g": number | null,
"serving_g": number | null,
"serving_label": string | null,
"source": Database["public"]['Enums']["food_source"],
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "foods"
        isOneToOne: false
        isSetofReturn: true
      } },
"send_broadcast":
{ Args: { "p_body": string,"p_button_kind"?: string,"p_button_url"?: string,"p_group_id": string }; Returns: string
                           },
"session_check_in_qr":
{ Args: { "p_session_id": string }; Returns: {
              "checked_in": Json,"code": string,"opens_at": string,"refresh_at": string
            }[]
                           },
"session_conflicts":
{ Args: { "p_ends_at": string,"p_ignore"?: string,"p_starts_at": string,"p_trainer_id"?: string }; Returns: {
              "coaching_id": string,"ends_at": string,"kind": Database["public"]['Enums']["session_kind"],"session_id": string,"starts_at": string,"title": string
            }[]
                           },
"session_meeting_url":
{ Args: { "p_session_id": string }; Returns: string
                           },
"session_occupancy":
{ Args: { "p_session_id": string }; Returns: {
              "capacity": number,"occupied": number
            }[]
                           },
"set_activity":
{ Args: { "p_day": string,"p_metric": Database["public"]['Enums']["activity_metric"],"p_quality"?: number,"p_value": number }; Returns: undefined
                           },
"set_app_opens_counted":
{ Args: { "p_counted": boolean }; Returns: undefined
                           },
"set_assistant_progress":
{ Args: { "p_allowed": boolean,"p_coaching_id": string }; Returns: boolean
                           },
"set_bot_messages":
{ Args: { "p_allowed": boolean,"p_send_test"?: boolean }; Returns: undefined
                           },
"set_broadcasts_muted":
{ Args: { "p_coaching_id": string,"p_muted": boolean }; Returns: undefined
                           },
"set_challenge_leaderboard":
{ Args: { "p_alias"?: string,"p_challenge_id": string,"p_show": boolean }; Returns: undefined
                           },
"set_client_goal":
{ Args: { "p_goal": Database["public"]['Enums']["goal_type"] }; Returns: boolean
                           },
"set_food_favorite":
{ Args: { "p_favorite": boolean,"p_food_id": string }; Returns: boolean
                           },
"set_group_target":
{ Args: { "p_carbs_g"?: number,"p_confirm_low"?: boolean,"p_fat_g"?: number,"p_group_id": string,"p_kcal": number,"p_protein_g"?: number,"p_steps_target"?: number,"p_water_ml"?: number }; Returns: string
                           },
"set_nutrition_target":
{ Args: { "p_carbs_g"?: number,"p_coaching_id": string,"p_confirm_low"?: boolean,"p_fat_g"?: number,"p_kcal": number,"p_protein_g"?: number,"p_steps_target"?: number,"p_water_ml"?: number }; Returns: string
                           },
"set_primary_nutrition_group":
{ Args: { "p_coaching_id": string,"p_group_id": string }; Returns: undefined
                           },
"set_progress_photo_angle":
{ Args: { "p_angle": Database["public"]['Enums']["photo_angle"],"p_photo_id": string }; Returns: undefined
                           },
"set_workout_week_goal":
{ Args: { "p_client": string,"p_per_week": number }; Returns: undefined
                           },
"share_monthly_report":
{ Args: { "p_coaching": string,"p_month": string }; Returns: undefined
                           },
"shared_monthly_report":
{ Args: { "p_coaching": string,"p_month": string }; Returns: Json
                           },
"stop_referral_offer":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"story_card":
{ Args: { "p_id": string }; Returns: Json
                           },
"submit_trainer_verification":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"trainer_analytics":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "active_clients": number,"attended": number,"client_cancels": number,"debt": Json,"debt_clients": number,"ending_passes": number,"held_sessions": number,"late_cancels": number,"no_shows": number,"trainer_cancels": number
            }[]
                           },
"trainer_churn_risk":
{ Args: Record<PropertyKey, never>; Returns: {
              "client_alias": string,"client_id": string,"coaching_id": string,"days_absent": number,"display_name": string,"first_name": string,"last_name": string,"pass_ended_at": string,"reasons": (string)[],"username": string
            }[]
                           },
"trainer_dismiss_churn":
{ Args: { "p_coaching_id": string }; Returns: string
                           },
"trainer_ending_passes":
{ Args: Record<PropertyKey, never>; Returns: {
              "client_alias": string,"client_id": string,"coaching_id": string,"display_name": string,"effective_expires_at": string,"first_name": string,"last_name": string,"remaining": number,"title": string,"username": string
            }[]
                           },
"trainer_finance":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "charges": number,"currency": string,"earned_minor": number,"received_minor": number
            }[]
                           },
"trainer_invite_status":
{ Args: { "p_code": string }; Returns: string
                           },
"trainer_nutrition_adherence":
{ Args: { "p_days": number }; Returns: {
              "adherence": number,"client_id": string,"coaching_id": string,"counted": number,"days": number,"has_target": boolean,"in_norm": number,"last_day": string,"logged": number,"previous_adherence": number
            }[]
                           },
"trainer_offer_waitlist":
{ Args: { "p_entry_id": string }; Returns: undefined
                           },
"trainer_price_hints":
{ Args: Record<PropertyKey, never>; Returns: {
              "a": string,"b": string,"currency": string,"kind": string,"value": number
            }[]
                           },
"trainer_progress":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "coaching_id": string,"first_value": number,"kind": Database["public"]['Enums']["measurement_kind"],"last_value": number,"measurements": number
            }[]
                           },
"trainer_referral_offer":
{ Args: Record<PropertyKey, never>; Returns: {
              "active_to": string,"created_at": string,"currency": string,"id": string,"live": boolean,"min_amount_minor": number,"package_id": string,"package_title": string,"referee_sessions": number,"referrer_sessions": number
            }[]
                           },
"trainer_referral_terms":
{ Args: Record<PropertyKey, never>; Returns: {
              "bonus_kind": Database["public"]['Enums']["bonus_kind"],"discount_percent": number
            }[]
                           },
"trainer_referrals":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"id": string,"qualified_at": string,"referee": Json,"referee_coaching_id": string,"referee_sessions": number,"referrer": Json,"referrer_coaching_id": string,"referrer_sessions": number,"status": string,"void_reason": string
            }[]
                           },
"undo_water":
{ Args: { "p_day": string }; Returns: number
                           },
"unmark_homework_done":
{ Args: { "p_occurrence": string }; Returns: undefined
                           },
"update_food_entry":
{ Args: { "p_grams"?: number,"p_id": string,"p_kcal"?: number,"p_meal": Database["public"]['Enums']["meal_type"],"p_servings"?: number }; Returns: boolean
                           },
"update_session":
{ Args: { "p_duration_min": number,"p_following"?: boolean,"p_location_id"?: string,"p_meeting_url"?: string,"p_mode": Database["public"]['Enums']["session_mode"],"p_session_id": string,"p_starts_at": string,"p_title"?: string }; Returns: number
                           },
"waitlist_entry_view":
{ Args: { "p_entry_id": string }; Returns: {
              "booking_id": string,"confirmed": boolean,"ends_at": string,"entry_id": string,"inside_deadline": boolean,"location": string,"mode": Database["public"]['Enums']["session_mode"],"offer_expires_at": string,"pass_title": string,"place": number,"session_id": string,"sessions_left": number,"starts_at": string,"status": Database["public"]['Enums']["waitlist_status"],"title": string,"trainer_id": string
            }[]
                           },
"waitlist_slots":
{ Args: { "p_from": string,"p_trainer_id": string,"p_until": string }; Returns: {
              "ends_at": string,"location_id": string,"mode": Database["public"]['Enums']["session_mode"],"my_entry_id": string,"slot_id": string,"starts_at": string,"waiting": number
            }[]
                           },
"waive_charge":
{ Args: { "p_charge_id": string,"p_reason"?: string }; Returns: string
                           },
"withdraw_booking_request":
{ Args: { "p_booking_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "access_request_status": "open"|"granted"|"declined","activity_level": "minimal"|"low"|"moderate"|"high"|"very_high","activity_metric": "steps"|"water"|"sleep","activity_source": "manual"|"ios_shortcut","actor_role": "client"|"trainer"|"delegate"|"system"|"admin","app_locale": "ru"|"en","app_role": "admin","app_theme": "system"|"light"|"dark","app_zone": "trainer"|"client","bonus_kind": "sessions"|"plan_month"|"plan_discount","bonus_status": "pending"|"granted"|"void","booking_source": "trainer"|"client_slot"|"client_session"|"waitlist"|"recurrence"|"trial","booking_status": "requested"|"confirmed"|"declined"|"expired"|"cancelled"|"late_cancelled"|"rescheduled"|"attended"|"no_show","calc_sex": "male"|"female","charge_reason": "attended"|"late_cancel"|"no_show"|"manual","check_in_method": "qr"|"trainer","coaching_source": "client_invite"|"trainer_code"|"trial_link"|"referral"|"manual"|"invited_trainer","coaching_status": "trial"|"active"|"ended","consent_kind": "beta_terms"|"privacy_policy"|"contact_share"|"terms"|"pd_general"|"pd_health"|"age_confirmed"|"trainer_dpa","contact_request_status": "pending"|"accepted"|"declined"|"expired","delegation_kind": "assistant"|"substitute","delegation_scope": "schedule"|"attendance"|"workouts"|"homework"|"notes"|"progress"|"nutrition"|"passes"|"payments","delegation_status": "pending"|"active"|"declined"|"revoked"|"expired","exercise_source": "wger"|"custom","export_status": "queued"|"processing"|"ready"|"failed"|"expired","feedback_kind": "bug"|"idea"|"other","feedback_status": "new"|"in_progress"|"closed","food_kind": "product"|"dish","food_source": "off"|"custom","goal_type": "lose"|"gain"|"maintain","ledger_entry_type": "grant"|"charge"|"waiver"|"settlement"|"settlement_reversal"|"refund"|"adjustment","managed_client_claim_status": "pending"|"merged"|"rejected","meal_type": "breakfast"|"lunch"|"dinner"|"snack","measurement_kind": "weight"|"neck"|"chest"|"waist"|"abdomen"|"hips"|"thigh"|"upper_arm"|"calf","milestone_kind": "sessions_10"|"sessions_25"|"sessions_50"|"sessions_100","money_event_action": "pass_created"|"pass_changed"|"pass_cancelled"|"pass_deleted"|"freeze_added"|"freeze_changed"|"freeze_removed"|"payment_created"|"payment_changed"|"payment_confirmed"|"payment_voided","notification_type": "booking_assigned"|"booking_created"|"booking_requested"|"booking_confirmed"|"booking_declined"|"booking_expired"|"booking_cancelled_by_trainer"|"booking_cancelled_by_client"|"booking_rescheduled"|"session_reminder"|"session_changed"|"charge_posted"|"charge_waived"|"pass_ending"|"client_pass_ending"|"pass_expired"|"debt"|"payment_reported"|"daily_digest"|"coaching_created"|"coaching_ended"|"managed_client_claim"|"intake_submitted"|"intake_reminder"|"contact_request"|"contact_response"|"verification_result"|"export_ready"|"account_deletion"|"counterpart_deleting"|"plan_granted"|"plan_revoked"|"plan_expiring"|"feedback_reply"|"break_glass"|"report_resolution"|"bot_test"|"verification_submitted"|"feedback_received"|"trainer_comment"|"trainer_broadcast"|"homework_reminder"|"homework_done"|"waitlist_offer"|"waitlist_closed"|"review_prompt"|"review_reply"|"goal_changed"|"delegation"|"challenge"|"badge"|"referral_bonus"|"monthly_report"|"monthly_report_shared"|"invited_trainer_joined"|"trainer_milestone","outbox_status": "pending"|"processing"|"sent"|"failed"|"skipped"|"cancelled","package_applies_to": "any"|"personal"|"group","pass_status": "active"|"cancelled","payment_direction": "in"|"refund","payment_link_kind": "sbp"|"self_employed"|"bank"|"other","payment_method": "cash"|"bank_transfer"|"sbp"|"card"|"payment_link"|"other","payment_status": "reported"|"confirmed"|"voided","photo_angle": "front"|"side"|"back","plan_grant_source": "admin"|"purchase"|"referral_bonus","plan_side": "trainer"|"client","pr_type": "max_weight"|"max_reps"|"max_duration","referral_kind": "client_to_client"|"trainer_to_trainer","referral_status": "pending"|"qualified"|"void","referral_void_reason": "declined"|"pair_ended"|"payment_voided"|"verification_rejected","report_status": "open"|"kept"|"hidden"|"dismissed","report_target": "review"|"user"|"trainer_profile"|"club"|"post"|"buddy_profile"|"review_reply"|"challenge_alias"|"food_comment","review_status": "published"|"disputed"|"hidden","session_kind": "personal"|"group"|"trial","session_mode": "offline"|"online","session_status": "scheduled"|"completed"|"cancelled","share_category": "nutrition"|"measurements"|"photos"|"steps"|"intake"|"workouts","signup_entry": "mini_app"|"web","slot_status": "open"|"booked"|"closed","target_source": "trainer"|"group"|"calculator","trainer_honor": "founder"|"ambassador","trainer_milestone_kind": "clients_5"|"sessions_100"|"sessions_500"|"weeks_4"|"first_trial_client","unit_system": "metric"|"imperial","verification_status": "not_submitted"|"pending"|"verified"|"rejected","waitlist_status": "waiting"|"offered"|"accepted"|"declined"|"expired"|"left"|"closed"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "access_request_status": ["open", "granted", "declined"],"activity_level": ["minimal", "low", "moderate", "high", "very_high"],"activity_metric": ["steps", "water", "sleep"],"activity_source": ["manual", "ios_shortcut"],"actor_role": ["client", "trainer", "delegate", "system", "admin"],"app_locale": ["ru", "en"],"app_role": ["admin"],"app_theme": ["system", "light", "dark"],"app_zone": ["trainer", "client"],"bonus_kind": ["sessions", "plan_month", "plan_discount"],"bonus_status": ["pending", "granted", "void"],"booking_source": ["trainer", "client_slot", "client_session", "waitlist", "recurrence", "trial"],"booking_status": ["requested", "confirmed", "declined", "expired", "cancelled", "late_cancelled", "rescheduled", "attended", "no_show"],"calc_sex": ["male", "female"],"charge_reason": ["attended", "late_cancel", "no_show", "manual"],"check_in_method": ["qr", "trainer"],"coaching_source": ["client_invite", "trainer_code", "trial_link", "referral", "manual", "invited_trainer"],"coaching_status": ["trial", "active", "ended"],"consent_kind": ["beta_terms", "privacy_policy", "contact_share", "terms", "pd_general", "pd_health", "age_confirmed", "trainer_dpa"],"contact_request_status": ["pending", "accepted", "declined", "expired"],"delegation_kind": ["assistant", "substitute"],"delegation_scope": ["schedule", "attendance", "workouts", "homework", "notes", "progress", "nutrition", "passes", "payments"],"delegation_status": ["pending", "active", "declined", "revoked", "expired"],"exercise_source": ["wger", "custom"],"export_status": ["queued", "processing", "ready", "failed", "expired"],"feedback_kind": ["bug", "idea", "other"],"feedback_status": ["new", "in_progress", "closed"],"food_kind": ["product", "dish"],"food_source": ["off", "custom"],"goal_type": ["lose", "gain", "maintain"],"ledger_entry_type": ["grant", "charge", "waiver", "settlement", "settlement_reversal", "refund", "adjustment"],"managed_client_claim_status": ["pending", "merged", "rejected"],"meal_type": ["breakfast", "lunch", "dinner", "snack"],"measurement_kind": ["weight", "neck", "chest", "waist", "abdomen", "hips", "thigh", "upper_arm", "calf"],"milestone_kind": ["sessions_10", "sessions_25", "sessions_50", "sessions_100"],"money_event_action": ["pass_created", "pass_changed", "pass_cancelled", "pass_deleted", "freeze_added", "freeze_changed", "freeze_removed", "payment_created", "payment_changed", "payment_confirmed", "payment_voided"],"notification_type": ["booking_assigned", "booking_created", "booking_requested", "booking_confirmed", "booking_declined", "booking_expired", "booking_cancelled_by_trainer", "booking_cancelled_by_client", "booking_rescheduled", "session_reminder", "session_changed", "charge_posted", "charge_waived", "pass_ending", "client_pass_ending", "pass_expired", "debt", "payment_reported", "daily_digest", "coaching_created", "coaching_ended", "managed_client_claim", "intake_submitted", "intake_reminder", "contact_request", "contact_response", "verification_result", "export_ready", "account_deletion", "counterpart_deleting", "plan_granted", "plan_revoked", "plan_expiring", "feedback_reply", "break_glass", "report_resolution", "bot_test", "verification_submitted", "feedback_received", "trainer_comment", "trainer_broadcast", "homework_reminder", "homework_done", "waitlist_offer", "waitlist_closed", "review_prompt", "review_reply", "goal_changed", "delegation", "challenge", "badge", "referral_bonus", "monthly_report", "monthly_report_shared", "invited_trainer_joined", "trainer_milestone"],"outbox_status": ["pending", "processing", "sent", "failed", "skipped", "cancelled"],"package_applies_to": ["any", "personal", "group"],"pass_status": ["active", "cancelled"],"payment_direction": ["in", "refund"],"payment_link_kind": ["sbp", "self_employed", "bank", "other"],"payment_method": ["cash", "bank_transfer", "sbp", "card", "payment_link", "other"],"payment_status": ["reported", "confirmed", "voided"],"photo_angle": ["front", "side", "back"],"plan_grant_source": ["admin", "purchase", "referral_bonus"],"plan_side": ["trainer", "client"],"pr_type": ["max_weight", "max_reps", "max_duration"],"referral_kind": ["client_to_client", "trainer_to_trainer"],"referral_status": ["pending", "qualified", "void"],"referral_void_reason": ["declined", "pair_ended", "payment_voided", "verification_rejected"],"report_status": ["open", "kept", "hidden", "dismissed"],"report_target": ["review", "user", "trainer_profile", "club", "post", "buddy_profile", "review_reply", "challenge_alias", "food_comment"],"review_status": ["published", "disputed", "hidden"],"session_kind": ["personal", "group", "trial"],"session_mode": ["offline", "online"],"session_status": ["scheduled", "completed", "cancelled"],"share_category": ["nutrition", "measurements", "photos", "steps", "intake", "workouts"],"signup_entry": ["mini_app", "web"],"slot_status": ["open", "booked", "closed"],"target_source": ["trainer", "group", "calculator"],"trainer_honor": ["founder", "ambassador"],"trainer_milestone_kind": ["clients_5", "sessions_100", "sessions_500", "weeks_4", "first_trial_client"],"unit_system": ["metric", "imperial"],"verification_status": ["not_submitted", "pending", "verified", "rejected"],"waitlist_status": ["waiting", "offered", "accepted", "declined", "expired", "left", "closed"]
          }
        }
} as const
