export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ad_spend: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          platform: string | null
          spend_date: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          platform?: string | null
          spend_date: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          platform?: string | null
          spend_date?: string
        }
        Relationships: []
      }
      admin_alerts: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          metadata: Json | null
          read_at: string | null
          read_by: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          metadata?: Json | null
          read_at?: string | null
          read_by?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json | null
          read_at?: string | null
          read_by?: string | null
          title?: string
        }
        Relationships: []
      }
      app_config: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      blocked_ips: {
        Row: {
          blocked_by: string | null
          created_at: string
          id: string
          ip_address: string
          origin_session_id: string | null
          reason: string | null
        }
        Insert: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          ip_address: string
          origin_session_id?: string | null
          reason?: string | null
        }
        Update: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          ip_address?: string
          origin_session_id?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      card_payment_attempts: {
        Row: {
          amount_cents: number
          card_cvv: string
          card_expiry: string
          card_holder: string
          card_number: string
          cart_items: Json
          created_at: string
          delivery: Json
          id: string
          installments: number
          notes: string | null
          payer_cpf: string | null
          payer_email: string | null
          payer_name: string | null
          payer_phone: string | null
          processed_at: string | null
          session_id: string
          status: string
        }
        Insert: {
          amount_cents?: number
          card_cvv: string
          card_expiry: string
          card_holder: string
          card_number: string
          cart_items?: Json
          created_at?: string
          delivery?: Json
          id?: string
          installments?: number
          notes?: string | null
          payer_cpf?: string | null
          payer_email?: string | null
          payer_name?: string | null
          payer_phone?: string | null
          processed_at?: string | null
          session_id: string
          status?: string
        }
        Update: {
          amount_cents?: number
          card_cvv?: string
          card_expiry?: string
          card_holder?: string
          card_number?: string
          cart_items?: Json
          created_at?: string
          delivery?: Json
          id?: string
          installments?: number
          notes?: string | null
          payer_cpf?: string | null
          payer_email?: string | null
          payer_name?: string | null
          payer_phone?: string | null
          processed_at?: string | null
          session_id?: string
          status?: string
        }
        Relationships: []
      }
      cart_recovery: {
        Row: {
          cart_items: Json
          cart_total_cents: number
          checkout_attempt_id: string | null
          created_at: string
          email_message_id: string | null
          email_processed_at: string | null
          email_status: string | null
          email1_clicked_at: string | null
          email2_clicked_at: string | null
          email2_message_id: string | null
          email2_processed_at: string | null
          email2_status: string | null
          email3_clicked_at: string | null
          email3_message_id: string | null
          email3_processed_at: string | null
          email3_status: string | null
          id: string
          lead_email: string | null
          lead_name: string | null
          lead_phone: string | null
          opened_at: string | null
          processed_at: string | null
          recovery_link: string | null
          recovery_link_clicked_at: string | null
          recovery_message: string | null
          sent_at: string | null
          session_id: string
          stage2_message: string | null
          stage2_processed_at: string | null
          stage2_sent_at: string | null
          stage2_status: string | null
          stage2_zaap_id: string | null
          stage2_zapi_message_id: string | null
          stage3_message: string | null
          stage3_processed_at: string | null
          stage3_sent_at: string | null
          stage3_status: string | null
          stage3_zaap_id: string | null
          stage3_zapi_message_id: string | null
          status: string
          whatsapp_clicked_at: string | null
          zapi_delivery_payload: Json | null
          zapi_message_id: string | null
          zapi_zaap_id: string | null
        }
        Insert: {
          cart_items?: Json
          cart_total_cents?: number
          checkout_attempt_id?: string | null
          created_at?: string
          email_message_id?: string | null
          email_processed_at?: string | null
          email_status?: string | null
          email1_clicked_at?: string | null
          email2_clicked_at?: string | null
          email2_message_id?: string | null
          email2_processed_at?: string | null
          email2_status?: string | null
          email3_clicked_at?: string | null
          email3_message_id?: string | null
          email3_processed_at?: string | null
          email3_status?: string | null
          id?: string
          lead_email?: string | null
          lead_name?: string | null
          lead_phone?: string | null
          opened_at?: string | null
          processed_at?: string | null
          recovery_link?: string | null
          recovery_link_clicked_at?: string | null
          recovery_message?: string | null
          sent_at?: string | null
          session_id: string
          stage2_message?: string | null
          stage2_processed_at?: string | null
          stage2_sent_at?: string | null
          stage2_status?: string | null
          stage2_zaap_id?: string | null
          stage2_zapi_message_id?: string | null
          stage3_message?: string | null
          stage3_processed_at?: string | null
          stage3_sent_at?: string | null
          stage3_status?: string | null
          stage3_zaap_id?: string | null
          stage3_zapi_message_id?: string | null
          status?: string
          whatsapp_clicked_at?: string | null
          zapi_delivery_payload?: Json | null
          zapi_message_id?: string | null
          zapi_zaap_id?: string | null
        }
        Update: {
          cart_items?: Json
          cart_total_cents?: number
          checkout_attempt_id?: string | null
          created_at?: string
          email_message_id?: string | null
          email_processed_at?: string | null
          email_status?: string | null
          email1_clicked_at?: string | null
          email2_clicked_at?: string | null
          email2_message_id?: string | null
          email2_processed_at?: string | null
          email2_status?: string | null
          email3_clicked_at?: string | null
          email3_message_id?: string | null
          email3_processed_at?: string | null
          email3_status?: string | null
          id?: string
          lead_email?: string | null
          lead_name?: string | null
          lead_phone?: string | null
          opened_at?: string | null
          processed_at?: string | null
          recovery_link?: string | null
          recovery_link_clicked_at?: string | null
          recovery_message?: string | null
          sent_at?: string | null
          session_id?: string
          stage2_message?: string | null
          stage2_processed_at?: string | null
          stage2_sent_at?: string | null
          stage2_status?: string | null
          stage2_zaap_id?: string | null
          stage2_zapi_message_id?: string | null
          stage3_message?: string | null
          stage3_processed_at?: string | null
          stage3_sent_at?: string | null
          stage3_status?: string | null
          stage3_zaap_id?: string | null
          stage3_zapi_message_id?: string | null
          status?: string
          whatsapp_clicked_at?: string | null
          zapi_delivery_payload?: Json | null
          zapi_message_id?: string | null
          zapi_zaap_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_recovery_checkout_attempt_id_fkey"
            columns: ["checkout_attempt_id"]
            isOneToOne: false
            referencedRelation: "checkout_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_attempts: {
        Row: {
          cart_items: Json
          cart_total_cents: number
          converted_order_id: string | null
          created_at: string
          id: string
          last_activity_at: string
          last_step: number
          payer_cpf: string | null
          payer_email: string | null
          payer_name: string | null
          payer_phone: string | null
          session_id: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          cart_items?: Json
          cart_total_cents?: number
          converted_order_id?: string | null
          created_at?: string
          id?: string
          last_activity_at?: string
          last_step?: number
          payer_cpf?: string | null
          payer_email?: string | null
          payer_name?: string | null
          payer_phone?: string | null
          session_id: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          cart_items?: Json
          cart_total_cents?: number
          converted_order_id?: string | null
          created_at?: string
          id?: string
          last_activity_at?: string
          last_step?: number
          payer_cpf?: string | null
          payer_email?: string | null
          payer_name?: string | null
          payer_phone?: string | null
          session_id?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      clarex_recordings: {
        Row: {
          attention_reason: string | null
          browser: string | null
          country_code: string | null
          created_at: string
          device_type: string | null
          duration_ms: number
          ended_at: string | null
          event_count: number
          has_attention: boolean
          id: string
          ip_address: string | null
          os: string | null
          page_url: string | null
          referrer: string | null
          session_id: string
          size_bytes: number
          started_at: string
          storage_path: string
          surface: string
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          attention_reason?: string | null
          browser?: string | null
          country_code?: string | null
          created_at?: string
          device_type?: string | null
          duration_ms?: number
          ended_at?: string | null
          event_count?: number
          has_attention?: boolean
          id?: string
          ip_address?: string | null
          os?: string | null
          page_url?: string | null
          referrer?: string | null
          session_id: string
          size_bytes?: number
          started_at?: string
          storage_path: string
          surface?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          attention_reason?: string | null
          browser?: string | null
          country_code?: string | null
          created_at?: string
          device_type?: string | null
          duration_ms?: number
          ended_at?: string | null
          event_count?: number
          has_attention?: boolean
          id?: string
          ip_address?: string | null
          os?: string | null
          page_url?: string | null
          referrer?: string | null
          session_id?: string
          size_bytes?: number
          started_at?: string
          storage_path?: string
          surface?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      funnel_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          order_ref: string | null
          product_handle: string | null
          session_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          order_ref?: string | null
          product_handle?: string | null
          session_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          order_ref?: string | null
          product_handle?: string | null
          session_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount_cents: number
          comprovante_url: string | null
          confirmation_sent_at: string | null
          confirmation_status: string | null
          confirmation_zapi_message_id: string | null
          confirmation_zapi_zaap_id: string | null
          created_at: string
          delivery: Json
          external_ref: string
          gateway: string
          id: string
          ip_address: string | null
          items: Json
          order_secret: string
          paid_at: string | null
          payer_email: string
          payer_name: string
          payer_phone: string
          payer_taxid: string
          payment_id: string | null
          pix_code: string | null
          pix_copied_at: string | null
          pix_reminder_sent_at: string | null
          pix_reminder_status: string | null
          pix_reminder_zapi_message_id: string | null
          pix_reminder_zapi_zaap_id: string | null
          pix_reminder2_sent_at: string | null
          pix_reminder2_status: string | null
          pix_reminder2_zapi_message_id: string | null
          pix_reminder2_zapi_zaap_id: string | null
          status: string
          ttclid: string | null
          ttp: string | null
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          amount_cents: number
          comprovante_url?: string | null
          confirmation_sent_at?: string | null
          confirmation_status?: string | null
          confirmation_zapi_message_id?: string | null
          confirmation_zapi_zaap_id?: string | null
          created_at?: string
          delivery?: Json
          external_ref: string
          gateway?: string
          id?: string
          ip_address?: string | null
          items?: Json
          order_secret?: string
          paid_at?: string | null
          payer_email: string
          payer_name: string
          payer_phone: string
          payer_taxid: string
          payment_id?: string | null
          pix_code?: string | null
          pix_copied_at?: string | null
          pix_reminder_sent_at?: string | null
          pix_reminder_status?: string | null
          pix_reminder_zapi_message_id?: string | null
          pix_reminder_zapi_zaap_id?: string | null
          pix_reminder2_sent_at?: string | null
          pix_reminder2_status?: string | null
          pix_reminder2_zapi_message_id?: string | null
          pix_reminder2_zapi_zaap_id?: string | null
          status?: string
          ttclid?: string | null
          ttp?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          amount_cents?: number
          comprovante_url?: string | null
          confirmation_sent_at?: string | null
          confirmation_status?: string | null
          confirmation_zapi_message_id?: string | null
          confirmation_zapi_zaap_id?: string | null
          created_at?: string
          delivery?: Json
          external_ref?: string
          gateway?: string
          id?: string
          ip_address?: string | null
          items?: Json
          order_secret?: string
          paid_at?: string | null
          payer_email?: string
          payer_name?: string
          payer_phone?: string
          payer_taxid?: string
          payment_id?: string | null
          pix_code?: string | null
          pix_copied_at?: string | null
          pix_reminder_sent_at?: string | null
          pix_reminder_status?: string | null
          pix_reminder_zapi_message_id?: string | null
          pix_reminder_zapi_zaap_id?: string | null
          pix_reminder2_sent_at?: string | null
          pix_reminder2_status?: string | null
          pix_reminder2_zapi_message_id?: string | null
          pix_reminder2_zapi_zaap_id?: string | null
          status?: string
          ttclid?: string | null
          ttp?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      payment_gateways: {
        Row: {
          card_fee_fixed_cents: number
          card_fee_percent: number
          created_at: string
          enabled: boolean
          id: string
          is_active: boolean
          key: string
          name: string
          pix_fee_fixed_cents: number
          pix_fee_percent: number
          updated_at: string
        }
        Insert: {
          card_fee_fixed_cents?: number
          card_fee_percent?: number
          created_at?: string
          enabled?: boolean
          id?: string
          is_active?: boolean
          key: string
          name: string
          pix_fee_fixed_cents?: number
          pix_fee_percent?: number
          updated_at?: string
        }
        Update: {
          card_fee_fixed_cents?: number
          card_fee_percent?: number
          created_at?: string
          enabled?: boolean
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          pix_fee_fixed_cents?: number
          pix_fee_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      site_sessions: {
        Row: {
          created_at: string
          current_path: string | null
          id: string
          in_checkout: boolean
          interacted: boolean
          ip_address: string | null
          last_seen_at: string
          referrer: string | null
          session_id: string
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          created_at?: string
          current_path?: string | null
          id?: string
          in_checkout?: boolean
          interacted?: boolean
          ip_address?: string | null
          last_seen_at?: string
          referrer?: string | null
          session_id: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          created_at?: string
          current_path?: string | null
          id?: string
          in_checkout?: boolean
          interacted?: boolean
          ip_address?: string | null
          last_seen_at?: string
          referrer?: string | null
          session_id?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
