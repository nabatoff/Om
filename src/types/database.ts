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
      daily_reports: {
        Row: {
          calls_count: number;
          confirmed_sum: number;
          cp_sent: number;
          created_at: string;
          gep_done: number;
          gep_planned: number;
          id: string;
          manager_id: string;
          report_date: string;
          updated_at: string;
        };
        Insert: {
          calls_count?: number;
          confirmed_sum?: number;
          cp_sent?: number;
          created_at?: string;
          gep_done?: number;
          gep_planned?: number;
          id?: string;
          manager_id: string;
          report_date: string;
          updated_at?: string;
        };
        Update: {
          calls_count?: number;
          confirmed_sum?: number;
          cp_sent?: number;
          created_at?: string;
          gep_done?: number;
          gep_planned?: number;
          id?: string;
          manager_id?: string;
          report_date?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_reports_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      gep_events: {
        Row: {
          created_at: string;
          event_date: string;
          id: string;
          manager_id: string;
          supplier_id: string;
        };
        Insert: {
          created_at?: string;
          event_date: string;
          id?: string;
          manager_id: string;
          supplier_id: string;
        };
        Update: {
          created_at?: string;
          event_date?: string;
          id?: string;
          manager_id?: string;
          supplier_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gep_events_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gep_events_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string | null;
          id: string;
          monthly_calls_target: number;
          monthly_sales_target: number;
          role: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          full_name?: string | null;
          id: string;
          monthly_calls_target?: number;
          monthly_sales_target?: number;
          role?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          full_name?: string | null;
          id?: string;
          monthly_calls_target?: number;
          monthly_sales_target?: number;
          role?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      supplier_comments: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          id: string;
          supplier_id: string;
        };
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          id?: string;
          supplier_id: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          id?: string;
          supplier_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "supplier_comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_comments_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      supplier_notes: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          manager_id: string;
          supplier_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          manager_id: string;
          supplier_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          manager_id?: string;
          supplier_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "supplier_notes_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_notes_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      suppliers: {
        Row: {
          bin: string;
          category: string | null;
          created_at: string;
          id: string;
          kz_quality_mark: boolean;
          manager_id: string | null;
          name: string;
          next_contact_date: string | null;
          nkt_member: boolean;
          sku_count: number;
          status: string;
          updated_at: string;
        };
        Insert: {
          bin: string;
          category?: string | null;
          created_at?: string;
          id?: string;
          kz_quality_mark?: boolean;
          manager_id?: string | null;
          name: string;
          next_contact_date?: string | null;
          nkt_member?: boolean;
          sku_count?: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          bin?: string;
          category?: string | null;
          created_at?: string;
          id?: string;
          kz_quality_mark?: boolean;
          manager_id?: string | null;
          name?: string;
          next_contact_date?: string | null;
          nkt_member?: boolean;
          sku_count?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "suppliers_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      working_days_remaining_in_month: {
        Args: { p_ref: string };
        Returns: number;
      };
    };
    Enums: {
      [_ in never]: never;
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
    Enums: {},
  },
} as const;

export type ProfileRole = "admin" | "manager";
export type SupplierStatus =
  | "new"
  | "in_progress"
  | "gep_done"
  | "qualified";
