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
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_state: {
        Row: {
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      articles: {
        Row: {
          author: string | null
          category: string | null
          cluster_id: string | null
          content: string | null
          created_at: string | null
          embedding: string | null
          final_score: number | null
          id: string
          image_url: string | null
          is_published: boolean | null
          metadata: Json | null
          published_at: string | null
          published_on: string | null
          relevance_score: number | null
          source_name: string | null
          source_url: string
          summary_short: string | null
          title: string
        }
        Insert: {
          author?: string | null
          category?: string | null
          cluster_id?: string | null
          content?: string | null
          created_at?: string | null
          embedding?: string | null
          final_score?: number | null
          id?: string
          image_url?: string | null
          is_published?: boolean | null
          metadata?: Json | null
          published_at?: string | null
          published_on?: string | null
          relevance_score?: number | null
          source_name?: string | null
          source_url: string
          summary_short?: string | null
          title: string
        }
        Update: {
          author?: string | null
          category?: string | null
          cluster_id?: string | null
          content?: string | null
          created_at?: string | null
          embedding?: string | null
          final_score?: number | null
          id?: string
          image_url?: string | null
          is_published?: boolean | null
          metadata?: Json | null
          published_at?: string | null
          published_on?: string | null
          relevance_score?: number | null
          source_name?: string | null
          source_url?: string
          summary_short?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      clusters: {
        Row: {
          category: string | null
          created_at: string | null
          final_score: number | null
          id: string
          image_url: string | null
          is_published: boolean | null
          label: string | null
          last_processed_at: string | null
          published_on: string | null
          representative_article_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          final_score?: number | null
          id?: string
          image_url?: string | null
          is_published?: boolean | null
          label?: string | null
          last_processed_at?: string | null
          published_on?: string | null
          representative_article_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          final_score?: number | null
          id?: string
          image_url?: string | null
          is_published?: boolean | null
          label?: string | null
          last_processed_at?: string | null
          published_on?: string | null
          representative_article_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clusters_representative_article_id_fkey"
            columns: ["representative_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      digests: {
        Row: {
          content_json: Json
          created_at: string | null
          id: string
          published_at: string | null
          title: string
        }
        Insert: {
          content_json: Json
          created_at?: string | null
          id?: string
          published_at?: string | null
          title: string
        }
        Update: {
          content_json?: Json
          created_at?: string | null
          id?: string
          published_at?: string | null
          title?: string
        }
        Relationships: []
      }
      reading_list: {
        Row: {
          article_id: string | null
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          article_id?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          article_id?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reading_list_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          last_fetched_at: string | null
          name: string
          skip_scrape: boolean | null
          url: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_fetched_at?: string | null
          name: string
          skip_scrape?: boolean | null
          url: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_fetched_at?: string | null
          name?: string
          skip_scrape?: boolean | null
          url?: string
        }
        Relationships: []
      }
      summaries: {
        Row: {
          author: string | null
          cluster_id: string | null
          content_analysis: string | null
          content_full: string | null
          content_tldr: string | null
          created_at: string | null
          id: string
          image_url: string | null
          model_name: string | null
          source_count: number | null
          title: string | null
        }
        Insert: {
          author?: string | null
          cluster_id?: string | null
          content_analysis?: string | null
          content_full?: string | null
          content_tldr?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          model_name?: string | null
          source_count?: number | null
          title?: string | null
        }
        Update: {
          author?: string | null
          cluster_id?: string | null
          content_analysis?: string | null
          content_full?: string | null
          content_tldr?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          model_name?: string | null
          source_count?: number | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "summaries_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: true
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      find_similar_articles: {
        Args: {
          anchor_date: string
          exclude_id?: string
          match_count: number
          match_threshold: number
          query_embedding: string
          window_days: number
        }
        Returns: {
          cluster_id: string
          id: string
          published_at: string
          similarity: number
          source_name: string
          title: string
        }[]
      }
      get_cluster_article_counts: {
        Args: never
        Returns: {
          article_count: number
          cluster_id: string
        }[]
      }
      get_multi_article_clusters: {
        Args: never
        Returns: {
          article_count: number
          created_at: string
          final_score: number
          id: string
          is_published: boolean
          label: string
        }[]
      }
      get_pipeline_stats: { Args: never; Returns: Json }
      get_source_stats: {
        Args: never
        Returns: {
          article_count: number
          source_name: string
        }[]
      }
      search_clusters: {
        Args: {
          filter_status?: string
          limit_val?: number
          offset_val?: number
          search_query?: string
          sort_by?: string
        }
        Returns: {
          article_count: number
          created_at: string
          final_score: number
          id: string
          is_published: boolean
          label: string
          total_count: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
