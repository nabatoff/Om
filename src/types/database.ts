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
          bin: string;
          bitrix_url: string | null;
          client_category: string | null;
          company_name: string;
          created_at: string;
          current_work_comment: string | null;
          em_plan: number;
          id: string;
          manager_id: string;
          missing_requirement: Enums<"missing_requirement"> | null;
          missing_requirement_comment: string | null;
          nkt_status: Enums<"nkt_status">;
          nkt_submitted_at: string | null;
          omarket_status: Enums<"omarket_status"> | null;
          sales_department_description: string | null;
          sales_legal_entity: string | null;
          sales_volume_2025: number;
          sku_count: number;
          status: Enums<"client_status">;
          updated_at: string;
          yearly_plan: number;
        };
        Insert: {
          bin: string;
          bitrix_url?: string | null;
          client_category?: string | null;
          company_name: string;
          created_at?: string;
          current_work_comment?: string | null;
          em_plan?: number;
          id?: string;
          manager_id: string;
          missing_requirement?: Enums<"missing_requirement"> | null;
          missing_requirement_comment?: string | null;
          nkt_status?: Enums<"nkt_status">;
          nkt_submitted_at?: string | null;
          omarket_status?: Enums<"omarket_status"> | null;
          sales_department_description?: string | null;
          sales_legal_entity?: string | null;
          sales_volume_2025?: number;
          sku_count?: number;
          status: Enums<"client_status">;
          updated_at?: string;
          yearly_plan?: number;
        };
        Update: {
          bin?: string;
          bitrix_url?: string | null;
          client_category?: string | null;
          company_name?: string;
          created_at?: string;
          current_work_comment?: string | null;
          em_plan?: number;
          id?: string;
          manager_id?: string;
          missing_requirement?: Enums<"missing_requirement"> | null;
          missing_requirement_comment?: string | null;
          nkt_status?: Enums<"nkt_status">;
          nkt_submitted_at?: string | null;
          omarket_status?: Enums<"omarket_status"> | null;
          sales_department_description?: string | null;
          sales_legal_entity?: string | null;
          sales_volume_2025?: number;
          sku_count?: number;
          status?: Enums<"client_status">;
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
      manager_daily_kpi: {
        Row: {
          actual_calls: number;
          carry_to_next_day: number;
          confirmed_orders_sum: number;
          cp_sent: number;
          created_at: string;
          gep_done: number;
          gep_scheduled: number;
          id: string;
          manager_id: string;
          planned_calls: number;
          qualified_count: number;
          repeat_meetings: number;
          report_date: string;
          updated_at: string;
        };
        Insert: {
          actual_calls?: number;
          carry_to_next_day?: number;
          confirmed_orders_sum?: number;
          cp_sent?: number;
          created_at?: string;
          gep_done?: number;
          gep_scheduled?: number;
          id?: string;
          manager_id: string;
          planned_calls?: number;
          qualified_count?: number;
          repeat_meetings?: number;
          report_date: string;
          updated_at?: string;
        };
        Update: {
          actual_calls?: number;
          carry_to_next_day?: number;
          confirmed_orders_sum?: number;
          cp_sent?: number;
          created_at?: string;
          gep_done?: number;
          gep_scheduled?: number;
          id?: string;
          manager_id?: string;
          planned_calls?: number;
          qualified_count?: number;
          repeat_meetings?: number;
          report_date?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "manager_daily_kpi_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
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
