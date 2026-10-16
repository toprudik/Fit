
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
                    "client_id": string,"client_invite_id": string | null,"client_reminder_offsets": (number)[],"created_at": string,"debt_limit_sessions": number | null,"end_reason": string | null,"ended_at": string | null,"ended_by": string | null,"id": string,"self_book_on_debt": boolean,"source": Database["public"]['Enums']["coaching_source"],"started_at": string,"status": Database["public"]['Enums']["coaching_status"],"trainer_id": string,"trial_link_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"client_invite_id"?: string | null,"client_reminder_offsets": (number)[],"created_at"?: string,"debt_limit_sessions"?: number | null,"end_reason"?: string | null,"ended_at"?: string | null,"ended_by"?: string | null,"id"?: string,"self_book_on_debt"?: boolean,"source": Database["public"]['Enums']["coaching_source"],"started_at"?: string,"status"?: Database["public"]['Enums']["coaching_status"],"trainer_id": string,"trial_link_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "client_id"?: string,"client_invite_id"?: string | null,"client_reminder_offsets"?: (number)[],"created_at"?: string,"debt_limit_sessions"?: number | null,"end_reason"?: string | null,"ended_at"?: string | null,"ended_by"?: string | null,"id"?: string,"self_book_on_debt"?: boolean,"source"?: Database["public"]['Enums']["coaching_source"],"started_at"?: string,"status"?: Database["public"]['Enums']["coaching_status"],"trainer_id"?: string,"trial_link_id"?: string | null,"updated_at"?: string
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
                    "accepted_at": string,"id": string,"kind": Database["public"]['Enums']["consent_kind"],"revoked_at": string | null,"user_id": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["consent_kind"],"revoked_at"?: string | null,"user_id": string,"version": string
                  }
                  Update: {
                    "accepted_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["consent_kind"],"revoked_at"?: string | null,"user_id"?: string,"version"?: string
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
                    "app_version": string | null,"attachment_paths": (string)[],"body": string,"created_at": string,"github_issue_url": string | null,"id": string,"kind": Database["public"]['Enums']["feedback_kind"],"locale": Database["public"]['Enums']["app_locale"] | null,"platform": string | null,"route": string | null,"status": Database["public"]['Enums']["feedback_status"],"theme": Database["public"]['Enums']["app_theme"] | null,"updated_at": string,"user_id": string | null,"zone": Database["public"]['Enums']["app_zone"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "app_version"?: string | null,"attachment_paths"?: (string)[],"body": string,"created_at"?: string,"github_issue_url"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["feedback_kind"],"locale"?: Database["public"]['Enums']["app_locale"] | null,"platform"?: string | null,"route"?: string | null,"status"?: Database["public"]['Enums']["feedback_status"],"theme"?: Database["public"]['Enums']["app_theme"] | null,"updated_at"?: string,"user_id"?: string | null,"zone"?: Database["public"]['Enums']["app_zone"] | null
                  }
                  Update: {
                    "app_version"?: string | null,"attachment_paths"?: (string)[],"body"?: string,"created_at"?: string,"github_issue_url"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["feedback_kind"],"locale"?: Database["public"]['Enums']["app_locale"] | null,"platform"?: string | null,"route"?: string | null,"status"?: Database["public"]['Enums']["feedback_status"],"theme"?: Database["public"]['Enums']["app_theme"] | null,"updated_at"?: string,"user_id"?: string | null,"zone"?: Database["public"]['Enums']["app_zone"] | null
                  }
                  Relationships: [
                    {
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
                },"notification_outbox": {
                  Row: {
                    "attempts": number,"booking_id": string | null,"chat_target": string | null,"created_at": string,"dedupe_key": string,"deliver_after": string,"id": number,"last_error": string | null,"locked_until": string | null,"payload": NonNullable<Json>,"scheduled_for": string,"sent_at": string | null,"session_id": string | null,"status": Database["public"]['Enums']["outbox_status"],"telegram_message_id": number | null,"type": Database["public"]['Enums']["notification_type"],"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"booking_id"?: string | null,"chat_target"?: string | null,"created_at"?: string,"dedupe_key": string,"deliver_after": string,"id"?: never,"last_error"?: string | null,"locked_until"?: string | null,"payload": NonNullable<Json>,"scheduled_for": string,"sent_at"?: string | null,"session_id"?: string | null,"status"?: Database["public"]['Enums']["outbox_status"],"telegram_message_id"?: number | null,"type": Database["public"]['Enums']["notification_type"],"user_id"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"booking_id"?: string | null,"chat_target"?: string | null,"created_at"?: string,"dedupe_key"?: string,"deliver_after"?: string,"id"?: never,"last_error"?: string | null,"locked_until"?: string | null,"payload"?: NonNullable<Json>,"scheduled_for"?: string,"sent_at"?: string | null,"session_id"?: string | null,"status"?: Database["public"]['Enums']["outbox_status"],"telegram_message_id"?: number | null,"type"?: Database["public"]['Enums']["notification_type"],"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_outbox_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
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
                    "applies_to": Database["public"]['Enums']["package_applies_to"],"cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"client_id": string,"coaching_id": string,"created_at": string,"currency": string,"expires_at": string | null,"id": string,"is_drop_in": boolean,"note": string | null,"package_id": string | null,"price_minor": number,"sessions_total": number,"sold_by": string | null,"starts_on": string,"status": Database["public"]['Enums']["pass_status"],"title": string,"trainer_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "applies_to"?: Database["public"]['Enums']["package_applies_to"],"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"client_id": string,"coaching_id": string,"created_at"?: string,"currency": string,"expires_at"?: string | null,"id"?: string,"is_drop_in"?: boolean,"note"?: string | null,"package_id"?: string | null,"price_minor": number,"sessions_total": number,"sold_by"?: string | null,"starts_on": string,"status"?: Database["public"]['Enums']["pass_status"],"title": string,"trainer_id": string,"updated_at"?: string
                  }
                  Update: {
                    "applies_to"?: Database["public"]['Enums']["package_applies_to"],"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"client_id"?: string,"coaching_id"?: string,"created_at"?: string,"currency"?: string,"expires_at"?: string | null,"id"?: string,"is_drop_in"?: boolean,"note"?: string | null,"package_id"?: string | null,"price_minor"?: number,"sessions_total"?: number,"sold_by"?: string | null,"starts_on"?: string,"status"?: Database["public"]['Enums']["pass_status"],"title"?: string,"trainer_id"?: string,"updated_at"?: string
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
                },"reports": {
                  Row: {
                    "body": string | null,"created_at": string,"id": string,"reason": string,"reporter_id": string | null,"resolution_note": string | null,"resolved_at": string | null,"resolved_by": string | null,"status": Database["public"]['Enums']["report_status"],"target_id": string,"target_type": Database["public"]['Enums']["report_target"]
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"reason": string,"reporter_id"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["report_status"],"target_id": string,"target_type": Database["public"]['Enums']["report_target"]
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"reason"?: string,"reporter_id"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["report_status"],"target_id"?: string,"target_type"?: Database["public"]['Enums']["report_target"]
                  }
                  Relationships: [
                    {
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
    }
                  ]
                },"sessions": {
                  Row: {
                    "cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"capacity": number,"completed_at": string | null,"created_at": string,"created_by": string | null,"ends_at": string,"id": string,"is_exception": boolean,"kind": Database["public"]['Enums']["session_kind"],"location_id": string | null,"manually_adjusted_at": string | null,"meeting_url": string | null,"mode": Database["public"]['Enums']["session_mode"],"open_for_booking": boolean,"original_starts_at": string | null,"recurrence_id": string | null,"slot_id": string | null,"starts_at": string,"status": Database["public"]['Enums']["session_status"],"title": string | null,"trainer_id": string,"trial_link_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"capacity"?: number,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at": string,"id"?: string,"is_exception"?: boolean,"kind": Database["public"]['Enums']["session_kind"],"location_id"?: string | null,"manually_adjusted_at"?: string | null,"meeting_url"?: string | null,"mode": Database["public"]['Enums']["session_mode"],"open_for_booking"?: boolean,"original_starts_at"?: string | null,"recurrence_id"?: string | null,"slot_id"?: string | null,"starts_at": string,"status"?: Database["public"]['Enums']["session_status"],"title"?: string | null,"trainer_id": string,"trial_link_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"capacity"?: number,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at"?: string,"id"?: string,"is_exception"?: boolean,"kind"?: Database["public"]['Enums']["session_kind"],"location_id"?: string | null,"manually_adjusted_at"?: string | null,"meeting_url"?: string | null,"mode"?: Database["public"]['Enums']["session_mode"],"open_for_booking"?: boolean,"original_starts_at"?: string | null,"recurrence_id"?: string | null,"slot_id"?: string | null,"starts_at"?: string,"status"?: Database["public"]['Enums']["session_status"],"title"?: string | null,"trainer_id"?: string,"trial_link_id"?: string | null,"updated_at"?: string
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
                },"trainer_profiles": {
                  Row: {
                    "bio": string | null,"cancellation_deadline_hours": number,"city": string | null,"created_at": string,"default_client_reminder_offsets": (number)[],"default_currency": string,"headline": string | null,"is_public": boolean,"min_booking_notice_minutes": number,"slug": string,"specialties": (string)[],"trainer_invite_id": string | null,"updated_at": string,"user_id": string,"verification_status": Database["public"]['Enums']["verification_status"],"verified_at": string | null,"works_offline": boolean,"works_online": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "bio"?: string | null,"cancellation_deadline_hours"?: number,"city"?: string | null,"created_at"?: string,"default_client_reminder_offsets"?: (number)[],"default_currency"?: string,"headline"?: string | null,"is_public"?: boolean,"min_booking_notice_minutes"?: number,"slug": string,"specialties"?: (string)[],"trainer_invite_id"?: string | null,"updated_at"?: string,"user_id": string,"verification_status"?: Database["public"]['Enums']["verification_status"],"verified_at"?: string | null,"works_offline"?: boolean,"works_online"?: boolean
                  }
                  Update: {
                    "bio"?: string | null,"cancellation_deadline_hours"?: number,"city"?: string | null,"created_at"?: string,"default_client_reminder_offsets"?: (number)[],"default_currency"?: string,"headline"?: string | null,"is_public"?: boolean,"min_booking_notice_minutes"?: number,"slug"?: string,"specialties"?: (string)[],"trainer_invite_id"?: string | null,"updated_at"?: string,"user_id"?: string,"verification_status"?: Database["public"]['Enums']["verification_status"],"verified_at"?: string | null,"works_offline"?: boolean,"works_online"?: boolean
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
                },"trial_links": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"currency": string,"description": string | null,"duration_min": number,"expires_at": string | null,"id": string,"is_enabled": boolean,"location_id": string | null,"max_uses": number | null,"mode": Database["public"]['Enums']["session_mode"] | null,"price_minor": number,"title": string,"token": string,"trainer_id": string,"uses_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"currency": string,"description"?: string | null,"duration_min"?: number,"expires_at"?: string | null,"id"?: string,"is_enabled"?: boolean,"location_id"?: string | null,"max_uses"?: number | null,"mode"?: Database["public"]['Enums']["session_mode"] | null,"price_minor"?: number,"title": string,"token"?: string,"trainer_id": string,"uses_count"?: number
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"currency"?: string,"description"?: string | null,"duration_min"?: number,"expires_at"?: string | null,"id"?: string,"is_enabled"?: boolean,"location_id"?: string | null,"max_uses"?: number | null,"mode"?: Database["public"]['Enums']["session_mode"] | null,"price_minor"?: number,"title"?: string,"token"?: string,"trainer_id"?: string,"uses_count"?: number
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
            "add_group_participant":
{ Args: { "p_coaching_id": string,"p_session_id": string }; Returns: string
                           },
"adjust_pass":
{ Args: { "p_delta": number,"p_note": string,"p_pass_id": string }; Returns: string
                           },
"admin_block_user":
{ Args: { "p_reason": string,"p_user_id": string }; Returns: undefined
                           },
"admin_create_trainer_invite":
{ Args: { "p_note"?: string,"p_valid_days"?: number }; Returns: {
              "code": string,"expires_at": string,"invite_id": string
            }[]
                           },
"admin_decide_verification":
{ Args: { "p_decision": Database["public"]['Enums']["verification_status"],"p_reason"?: string,"p_trainer_id": string }; Returns: undefined
                           },
"admin_decline_access_request":
{ Args: { "p_request_id": string }; Returns: undefined
                           },
"admin_grant_plan":
{ Args: { "p_expires_at"?: string,"p_plan_code": string,"p_reason": string,"p_user_id": string }; Returns: string
                           },
"admin_overview":
{ Args: Record<PropertyKey, never>; Returns: {
              "active_invites": number,"active_pairs": number,"blocked_users": number,"trainers": number,"trainers_pending": number,"trainers_verified": number,"users": number
            }[]
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
"admin_unblock_user":
{ Args: { "p_reason": string,"p_user_id": string }; Returns: undefined
                           },
"admin_user_card":
{ Args: { "p_user_id": string }; Returns: {
              "blocked_at": string,"blocked_reason": string,"bookings_made": number,"client_active_pairs": number,"client_pairs": number,"created_at": string,"first_name": string,"is_admin": boolean,"is_trainer": boolean,"language_code": string,"last_name": string,"last_seen_at": string,"photo_url": string,"sessions_led": number,"telegram_id": number,"trainer_active_pairs": number,"trainer_pairs": number,"user_id": string,"username": string,"verification_status": Database["public"]['Enums']["verification_status"]
            }[]
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
              "capacity": number,"ends_at": string,"location_id": string,"mode": Database["public"]['Enums']["session_mode"],"my_booking_id": string,"session_id": string,"starts_at": string,"taken": number,"title": string
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
"calendar_feed":
{ Args: { "p_token": string }; Returns: Json
                           },
"cancel_my_booking":
{ Args: { "p_booking_id": string,"p_late"?: boolean,"p_reason"?: string }; Returns: Database["public"]['Enums']["booking_status"]
                           },
"cancel_pass":
{ Args: { "p_pass_id": string,"p_reason": string }; Returns: undefined
                           },
"cancel_session":
{ Args: { "p_following"?: boolean,"p_reason": string,"p_session_id": string }; Returns: number
                           },
"change_pass_expiry":
{ Args: { "p_last_day": string,"p_pass_id": string,"p_reason": string }; Returns: undefined
                           },
"claim_outbox":
{ Args: { "p_limit"?: number }; Returns: {
              "attempt": number,"chat_id": number,"chat_target": string,"kind": Database["public"]['Enums']["notification_type"],"locale": Database["public"]['Enums']["app_locale"],"outbox_id": number,"payload": Json,"silent": boolean,"time_zone": string
            }[]
                           },
"close_schedule_days":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "session_id": string,"starts_at": string,"title": string
            }[]
                           },
"create_calendar_feed":
{ Args: { "p_zone": Database["public"]['Enums']["app_zone"] }; Returns: string
                           },
"create_group_session":
{ Args: { "p_capacity": number,"p_count"?: number,"p_duration_min": number,"p_location_id"?: string,"p_meeting_url"?: string,"p_mode": Database["public"]['Enums']["session_mode"],"p_open_for_booking"?: boolean,"p_starts_at": string,"p_title": string,"p_until"?: string,"p_weekdays"?: (number)[] }; Returns: {
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
"decide_booking":
{ Args: { "p_accept": boolean,"p_booking_id": string,"p_reason"?: string }; Returns: Database["public"]['Enums']["booking_status"]
                           },
"effective_plan":
{ Args: { "p_side": Database["public"]['Enums']["plan_side"],"p_user": string }; Returns: string
                           },
"end_coaching":
{ Args: { "p_coaching_id": string,"p_reason"?: string }; Returns: number
                           },
"get_managed_client_claim":
{ Args: { "p_claim_id": string }; Returns: Json
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
              "coaching_id": string,"currency": string,"description": string,"duration_min": number,"headline": string,"location_address": string,"location_name": string,"mode": Database["public"]['Enums']["session_mode"],"name": string,"photo_url": string,"price_minor": number,"specialties": (string)[],"status": string,"title": string,"trainer_id": string,"verified": boolean,"works_offline": boolean,"works_online": boolean
            }[]
                           },
"get_trial_slots":
{ Args: { "p_token": string }; Returns: {
              "ends_at": string,"location_name": string,"mode": Database["public"]['Enums']["session_mode"],"slot_id": string,"starts_at": string
            }[]
                           },
"group_booking_preview":
{ Args: { "p_session_id": string }; Returns: {
              "confirmed": boolean,"pass_title": string,"sessions_left": number
            }[]
                           },
"has_entitlement":
{ Args: { "p_feature": string,"p_pair"?: string,"p_user": string }; Returns: boolean
                           },
"join_by_code":
{ Args: { "p_code": string }; Returns: string
                           },
"join_by_invite":
{ Args: { "p_token": string }; Returns: string
                           },
"join_by_showcase":
{ Args: { "p_slug": string }; Returns: string
                           },
"join_by_trial_link":
{ Args: { "p_token": string }; Returns: string
                           },
"last_exercise_results":
{ Args: { "p_before"?: string,"p_client": string,"p_exercises": (string)[] }; Returns: {
              "exercise_id": string,"log_id": string,"performed_at": string,"sets": Json
            }[]
                           },
"mark_attendance":
{ Args: { "p_booking_id": string,"p_reason"?: string,"p_status": Database["public"]['Enums']["booking_status"] }; Returns: Database["public"]['Enums']["booking_status"]
                           },
"my_client_invite":
{ Args: Record<PropertyKey, never>; Returns: {
              "code": string,"created_at": string,"invite_id": string,"token": string,"uses_count": number
            }[]
                           },
"my_inherited_rights":
{ Args: Record<PropertyKey, never>; Returns: {
              "coaching_id": string,"first_name": string,"last_name": string,"trainer_id": string,"username": string
            }[]
                           },
"my_plan":
{ Args: Record<PropertyKey, never>; Returns: {
              "active_clients": number,"client_limit": number,"expires_at": string,"plan_code": string,"side": Database["public"]['Enums']["plan_side"]
            }[]
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
"request_access":
{ Args: { "p_feature"?: string,"p_plan_code": string }; Returns: string
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
"revoke_calendar_feed":
{ Args: { "p_zone": Database["public"]['Enums']["app_zone"] }; Returns: boolean
                           },
"save_week_template":
{ Args: { "p_buffer_min"?: number,"p_horizon_weeks"?: number,"p_items": Json }; Returns: number
                           },
"save_workout_log":
{ Args: { "p_log": Json }; Returns: string
                           },
"search_exercises":
{ Args: { "p_category"?: string,"p_limit"?: number,"p_locale"?: Database["public"]['Enums']["app_locale"],"p_offset"?: number,"p_own_only"?: boolean,"p_query"?: string }; Returns: {
              "category": string,"equipment": (string)[],"id": string,"name": string,"own": boolean,"source": Database["public"]['Enums']["exercise_source"]
            }[]
                           },
"session_conflicts":
{ Args: { "p_ends_at": string,"p_ignore"?: string,"p_starts_at": string }; Returns: {
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
"set_bot_messages":
{ Args: { "p_allowed": boolean,"p_send_test"?: boolean }; Returns: undefined
                           },
"set_progress_photo_angle":
{ Args: { "p_angle": Database["public"]['Enums']["photo_angle"],"p_photo_id": string }; Returns: undefined
                           },
"submit_trainer_verification":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"trainer_invite_status":
{ Args: { "p_code": string }; Returns: string
                           },
"update_session":
{ Args: { "p_duration_min": number,"p_following"?: boolean,"p_location_id"?: string,"p_meeting_url"?: string,"p_mode": Database["public"]['Enums']["session_mode"],"p_session_id": string,"p_starts_at": string,"p_title"?: string }; Returns: number
                           },
"waive_charge":
{ Args: { "p_charge_id": string,"p_reason"?: string }; Returns: string
                           },
"withdraw_booking_request":
{ Args: { "p_booking_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "access_request_status": "open"|"granted"|"declined","actor_role": "client"|"trainer"|"delegate"|"system"|"admin","app_locale": "ru"|"en","app_role": "admin","app_theme": "system"|"light"|"dark","app_zone": "trainer"|"client","booking_source": "trainer"|"client_slot"|"client_session"|"waitlist"|"recurrence"|"trial","booking_status": "requested"|"confirmed"|"declined"|"expired"|"cancelled"|"late_cancelled"|"rescheduled"|"attended"|"no_show","charge_reason": "attended"|"late_cancel"|"no_show"|"manual","coaching_source": "client_invite"|"trainer_code"|"trial_link"|"referral"|"manual","coaching_status": "trial"|"active"|"ended","consent_kind": "beta_terms"|"privacy_policy"|"contact_share","contact_request_status": "pending"|"accepted"|"declined"|"expired","delegation_scope": "schedule"|"attendance"|"workouts"|"homework"|"notes"|"progress"|"nutrition"|"passes"|"payments","exercise_source": "wger"|"custom","export_status": "queued"|"processing"|"ready"|"failed"|"expired","feedback_kind": "bug"|"idea"|"other","feedback_status": "new"|"in_progress"|"closed","ledger_entry_type": "grant"|"charge"|"waiver"|"settlement"|"settlement_reversal"|"refund"|"adjustment","managed_client_claim_status": "pending"|"merged"|"rejected","measurement_kind": "weight"|"neck"|"chest"|"waist"|"abdomen"|"hips"|"thigh"|"upper_arm"|"calf","milestone_kind": "sessions_10"|"sessions_25"|"sessions_50"|"sessions_100","money_event_action": "pass_created"|"pass_changed"|"pass_cancelled"|"pass_deleted"|"freeze_added"|"freeze_changed"|"freeze_removed"|"payment_created"|"payment_changed"|"payment_confirmed"|"payment_voided","notification_type": "booking_assigned"|"booking_created"|"booking_requested"|"booking_confirmed"|"booking_declined"|"booking_expired"|"booking_cancelled_by_trainer"|"booking_cancelled_by_client"|"booking_rescheduled"|"session_reminder"|"session_changed"|"charge_posted"|"charge_waived"|"pass_ending"|"client_pass_ending"|"pass_expired"|"debt"|"payment_reported"|"daily_digest"|"coaching_created"|"coaching_ended"|"managed_client_claim"|"intake_submitted"|"intake_reminder"|"contact_request"|"contact_response"|"verification_result"|"export_ready"|"account_deletion"|"counterpart_deleting"|"plan_granted"|"plan_revoked"|"plan_expiring"|"feedback_reply"|"break_glass"|"report_resolution"|"bot_test"|"verification_submitted"|"feedback_received"|"trainer_comment"|"trainer_broadcast"|"homework_reminder"|"homework_done"|"waitlist_offer"|"waitlist_closed"|"review_prompt"|"review_reply"|"goal_changed"|"delegation"|"challenge"|"badge"|"referral_bonus","outbox_status": "pending"|"processing"|"sent"|"failed"|"skipped"|"cancelled","package_applies_to": "any"|"personal"|"group","pass_status": "active"|"cancelled","payment_direction": "in"|"refund","payment_link_kind": "sbp"|"self_employed"|"bank"|"other","payment_method": "cash"|"bank_transfer"|"sbp"|"card"|"payment_link"|"other","payment_status": "reported"|"confirmed"|"voided","photo_angle": "front"|"side"|"back","plan_grant_source": "admin"|"purchase"|"referral_bonus","plan_side": "trainer"|"client","pr_type": "max_weight"|"max_reps"|"max_duration","report_status": "open"|"kept"|"hidden"|"dismissed","report_target": "review"|"user"|"trainer_profile"|"club"|"post"|"buddy_profile","session_kind": "personal"|"group"|"trial","session_mode": "offline"|"online","session_status": "scheduled"|"completed"|"cancelled","share_category": "nutrition"|"measurements"|"photos"|"steps"|"intake"|"workouts","slot_status": "open"|"booked"|"closed","unit_system": "metric"|"imperial","verification_status": "not_submitted"|"pending"|"verified"|"rejected"
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
            "access_request_status": ["open", "granted", "declined"],"actor_role": ["client", "trainer", "delegate", "system", "admin"],"app_locale": ["ru", "en"],"app_role": ["admin"],"app_theme": ["system", "light", "dark"],"app_zone": ["trainer", "client"],"booking_source": ["trainer", "client_slot", "client_session", "waitlist", "recurrence", "trial"],"booking_status": ["requested", "confirmed", "declined", "expired", "cancelled", "late_cancelled", "rescheduled", "attended", "no_show"],"charge_reason": ["attended", "late_cancel", "no_show", "manual"],"coaching_source": ["client_invite", "trainer_code", "trial_link", "referral", "manual"],"coaching_status": ["trial", "active", "ended"],"consent_kind": ["beta_terms", "privacy_policy", "contact_share"],"contact_request_status": ["pending", "accepted", "declined", "expired"],"delegation_scope": ["schedule", "attendance", "workouts", "homework", "notes", "progress", "nutrition", "passes", "payments"],"exercise_source": ["wger", "custom"],"export_status": ["queued", "processing", "ready", "failed", "expired"],"feedback_kind": ["bug", "idea", "other"],"feedback_status": ["new", "in_progress", "closed"],"ledger_entry_type": ["grant", "charge", "waiver", "settlement", "settlement_reversal", "refund", "adjustment"],"managed_client_claim_status": ["pending", "merged", "rejected"],"measurement_kind": ["weight", "neck", "chest", "waist", "abdomen", "hips", "thigh", "upper_arm", "calf"],"milestone_kind": ["sessions_10", "sessions_25", "sessions_50", "sessions_100"],"money_event_action": ["pass_created", "pass_changed", "pass_cancelled", "pass_deleted", "freeze_added", "freeze_changed", "freeze_removed", "payment_created", "payment_changed", "payment_confirmed", "payment_voided"],"notification_type": ["booking_assigned", "booking_created", "booking_requested", "booking_confirmed", "booking_declined", "booking_expired", "booking_cancelled_by_trainer", "booking_cancelled_by_client", "booking_rescheduled", "session_reminder", "session_changed", "charge_posted", "charge_waived", "pass_ending", "client_pass_ending", "pass_expired", "debt", "payment_reported", "daily_digest", "coaching_created", "coaching_ended", "managed_client_claim", "intake_submitted", "intake_reminder", "contact_request", "contact_response", "verification_result", "export_ready", "account_deletion", "counterpart_deleting", "plan_granted", "plan_revoked", "plan_expiring", "feedback_reply", "break_glass", "report_resolution", "bot_test", "verification_submitted", "feedback_received", "trainer_comment", "trainer_broadcast", "homework_reminder", "homework_done", "waitlist_offer", "waitlist_closed", "review_prompt", "review_reply", "goal_changed", "delegation", "challenge", "badge", "referral_bonus"],"outbox_status": ["pending", "processing", "sent", "failed", "skipped", "cancelled"],"package_applies_to": ["any", "personal", "group"],"pass_status": ["active", "cancelled"],"payment_direction": ["in", "refund"],"payment_link_kind": ["sbp", "self_employed", "bank", "other"],"payment_method": ["cash", "bank_transfer", "sbp", "card", "payment_link", "other"],"payment_status": ["reported", "confirmed", "voided"],"photo_angle": ["front", "side", "back"],"plan_grant_source": ["admin", "purchase", "referral_bonus"],"plan_side": ["trainer", "client"],"pr_type": ["max_weight", "max_reps", "max_duration"],"report_status": ["open", "kept", "hidden", "dismissed"],"report_target": ["review", "user", "trainer_profile", "club", "post", "buddy_profile"],"session_kind": ["personal", "group", "trial"],"session_mode": ["offline", "online"],"session_status": ["scheduled", "completed", "cancelled"],"share_category": ["nutrition", "measurements", "photos", "steps", "intake", "workouts"],"slot_status": ["open", "booked", "closed"],"unit_system": ["metric", "imperial"],"verification_status": ["not_submitted", "pending", "verified", "rejected"]
          }
        }
} as const
