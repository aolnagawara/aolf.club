export type ApiRequest = {
  method?: string;
  headers: {
    cookie?: string;
    [key: string]: string | string[] | undefined;
  };
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
};

export type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => ApiResponse;
  setHeader: (name: string, value: string | string[]) => void;
  getHeader: (name: string) => number | string | string[] | undefined;
  end: (body?: string) => void;
};
