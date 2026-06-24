export interface RosterClient {
  id: string;
  assignedRole: string;
  status: 'connected' | 'disconnected';
  metadata?: {
    name?: string;
    version?: string;
    [key: string]: any;
  };
}
