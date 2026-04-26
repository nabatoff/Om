export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.4";
  };
  public: {
    Tables: {
      client_month_metrics: {
        Row: {
          client_id: string;
          created_at: string;
          delivered_amount: number;
          id: string;
          month: string;
          potential_amount: number;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          delivered_amount?: number;
          id?: string;
          month: string;
          potential_amount?: number;
          updated_at?: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          delivered_amount?: number;
          id?: string;
          month?: string;
          potential_amount?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "client_month_metrics_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          bin: string | null;
          bitrix_url: string | null;
          client_category: string | null;
          company_name: string;
          created_at: string;
          current_work_comment: string | null;
          em_plan: number;
          id: string;
          manager_id: string;
          missing_requirement:
            | Database["public"]["Enums"]["missing_requirement"]
            | null;
          missing_requirement_comment: string | null;
          nkt_status: Database["public"]["Enums"]["nkt_status"];
          nkt_submitted_at: string | null;
          omarket_status: Database["public"]["Enums"]["omarket_status"] | null;
          sales_department_description: string | null;
          sales_legal_entity: string | null;
          sales_volume_2025: number;
          sku_count: number;
          status: Database["public"]["Enums"]["client_status"];
          updated_at: string;
          yearly_plan: number;
        };
        Insert: {
          bin?: string | null;
          bitrix_url?: string | null;
          client_category?: string | null;
          company_name: string;
          created_at?: string;
          current_work_comment?: string | null;
          em_plan?: number;
          id?: string;
          manager_id: string;
          missing_requirement?:
            | Database["public"]["Enums"]["missing_requirement"]
            | null;
          missing_requirement_comment?: string | null;
          nkt_status?: Database["public"]["Enums"]["nkt_status"];
          nkt_submitted_at?: string | null;
          omarket_status?: Database["public"]["Enums"]["omarket_status"] | null;
          sales_department_description?: string | null;
          sales_legal_entity?: string | null;
          sales_volume_2025?: number;
          sku_count?: number;
          status: Database["public"]["Enums"]["client_status"];
          updated_at?: string;
          yearly_plan?: number;
        };
        Update: {
          bin?: string | null;
          bitrix_url?: string | null;
          client_category?: string | null;
          company_name?: string;
          created_at?: string;
          current_work_comment?: string | null;
          em_plan?: number;
          id?: string;
          manager_id?: string;
          missing_requirement?:
            | Database["public"]["Enums"]["missing_requirement"]
            | null;
          missing_requirement_comment?: string | null;
          nkt_status?: Database["public"]["Enums"]["nkt_status"];
          nkt_submitted_at?: string | null;
          omarket_status?: Database["public"]["Enums"]["omarket_status"] | null;
          sales_department_description?: string | null;
          sales_legal_entity?: string | null;
          sales_volume_2025?: number;
          sku_count?: number;
          status?: Database["public"]["Enums"]["client_status"];
          updated_at?: string;
          yearly_plan?: number;
        };
        Relationships: [
          {
            foreignKeyName: "clients_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_conducted_meetings: {
        Row: {
          client_id: string;
          id: string;
          meeting_date: string;
          meeting_kind: Database["public"]["Enums"]["crm_meeting_kind"];
          report_id: string;
          result: string;
          sort_order: number;
        };
        Insert: {
          client_id: string;
          id?: string;
          meeting_date: string;
          meeting_kind: Database["public"]["Enums"]["crm_meeting_kind"];
          report_id: string;
          result?: string;
          sort_order?: number;
        };
        Update: {
          client_id?: string;
          id?: string;
          meeting_date?: string;
          meeting_kind?: Database["public"]["Enums"]["crm_meeting_kind"];
          report_id?: string;
          result?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "crm_conducted_meetings_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_conducted_meetings_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "crm_daily_reports";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_daily_reports: {
        Row: {
          calls_total: number;
          created_at: string;
          id: string;
          manager_id: string;
          new_in_work: number;
          processed_total: number;
          report_date: string;
          updated_at: string;
          validated_total: number;
        };
        Insert: {
          calls_total?: number;
          created_at?: string;
          id?: string;
          manager_id: string;
          new_in_work?: number;
          processed_total?: number;
          report_date: string;
          updated_at?: string;
          validated_total?: number;
        };
        Update: {
          calls_total?: number;
          created_at?: string;
          id?: string;
          manager_id?: string;
          new_in_work?: number;
          processed_total?: number;
          report_date?: string;
          updated_at?: string;
          validated_total?: number;
        };
        Relationships: [
          {
            foreignKeyName: "crm_daily_reports_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_order_groups: {
        Row: {
          client_id: string;
          id: string;
          report_id: string;
          sort_order: number;
        };
        Insert: {
          client_id: string;
          id?: string;
          report_id: string;
          sort_order?: number;
        };
        Update: {
          client_id?: string;
          id?: string;
          report_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "crm_order_groups_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_order_groups_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "crm_daily_reports";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_order_lines: {
        Row: {
          amount: number;
          id: string;
          line_index: number;
          order_group_id: string;
        };
        Insert: {
          amount?: number;
          id?: string;
          line_index: number;
          order_group_id: string;
        };
        Update: {
          amount?: number;
          id?: string;
          line_index?: number;
          order_group_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_order_lines_order_group_id_fkey";
            columns: ["order_group_id"];
            isOneToOne: false;
            referencedRelation: "crm_order_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_planned_meetings: {
        Row: {
          client_id: string;
          id: string;
          meeting_date: string;
          meeting_kind: Database["public"]["Enums"]["crm_meeting_kind"];
          report_id: string;
          sort_order: number;
        };
        Insert: {
          client_id: string;
          id?: string;
          meeting_date: string;
          meeting_kind: Database["public"]["Enums"]["crm_meeting_kind"];
          report_id: string;
          sort_order?: number;
        };
        Update: {
          client_id?: string;
          id?: string;
          meeting_date?: string;
          meeting_kind?: Database["public"]["Enums"]["crm_meeting_kind"];
          report_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "crm_planned_meetings_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_planned_meetings_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "crm_daily_reports";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          default_daily_calls_plan: number;
          full_name: string | null;
          id: string;
          is_active: boolean;
          monthly_calls_target: number;
          monthly_sales_target: number;
          role: string;
          team: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          default_daily_calls_plan?: number;
          full_name?: string | null;
          id: string;
          is_active?: boolean;
          monthly_calls_target?: number;
          monthly_sales_target?: number;
          role?: string;
          team?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          default_daily_calls_plan?: number;
          full_name?: string | null;
          id?: string;
          is_active?: boolean;
          monthly_calls_target?: number;
          monthly_sales_target?: number;
          role?: string;
          team?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_admin: { Args: never; Returns: boolean };
      working_days_remaining_in_month: {
        Args: { p_ref: string };
        Returns: number;
      };
    };
    Enums: {
      client_status: "ktp" | "distr" | "dealer" | "resale";
      crm_meeting_kind: "new" | "repeat";
      missing_requirement:
        | "responsible"
        | "tech_conditions"
        | "photos"
        | "no_preorders"
        | "docs";
      nkt_status: "draft" | "on_moderation" | "kz_badge";
      omarket_status: "cards_created" | "wg_set" | "initial_setup";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      client_status: ["ktp", "distr", "dealer", "resale"],
      crm_meeting_kind: ["new", "repeat"],
      missing_requirement: [
        "responsible",
        "tech_conditions",
        "photos",
        "no_preorders",
        "docs",
      ],
      nkt_status: ["draft", "on_moderation", "kz_badge"],
      omarket_status: ["cards_created", "wg_set", "initial_setup"],
    },
  },
} as const;

export type ProfileRole = "admin" | "manager";
export type ClientStatus = Enums<"client_status">;
export type NktStatus = Enums<"nkt_status">;
export type OMarketStatus = Enums<"omarket_status">;
export type MissingRequirement = Enums<"missing_requirement">;
export type CrmMeetingKind = Enums<"crm_meeting_kind">;
