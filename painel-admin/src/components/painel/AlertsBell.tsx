import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, AlertTriangle, CheckCheck, X } from "lucide-react";
import { getAdminAlerts, markAlertRead, markAllAlertsRead } from "@/lib/alerts.functions";
import { formatBR } from "@/lib/datetime";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export function AlertsBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const fetchAlerts = useServerFn(getAdminAlerts);
  const doMarkRead = useServerFn(markAlertRead);
  const doMarkAll = useServerFn(markAllAlertsRead);

  const { data } = useQuery({
    queryKey: ["admin-alerts"],
    queryFn: () => fetchAlerts({ data: undefined }),
    refetchInterval: 60_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => doMarkRead({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-alerts"] }),
  });

  const markAll = useMutation({
    mutationFn: () => doMarkAll({ data: undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-alerts"] });
      toast.success("Todos os alertas marcados como lidos");
    },
  });

  const unread = data?.unreadCount ?? 0;
  const alerts = data?.alerts ?? [];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 hover:bg-gray-50"
        title="Alertas"
      >
        <Bell className="w-4 h-4 text-gray-700" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" /> Alertas
              </span>
              {unread > 0 && (
                <button
                  onClick={() => markAll.mutate()}
                  className="inline-flex items-center gap-1 text-xs font-normal text-gray-600 hover:text-gray-900 px-2 py-1 rounded border border-gray-200"
                >
                  <CheckCheck className="w-3 h-3" /> Marcar tudo como lido
                </button>
              )}
            </DialogTitle>
          </DialogHeader>

          {alerts.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Nenhum alerta no momento.</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((a: any) => (
                <div
                  key={a.id}
                  className={`p-3 rounded-lg border ${
                    a.read_at ? "border-gray-200 bg-white" : "border-red-200 bg-red-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            a.severity === "error"
                              ? "bg-red-100 text-red-700"
                              : a.severity === "warning"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {a.severity}
                        </span>
                        <span className="font-semibold text-sm text-gray-900">{a.title}</span>
                      </div>
                      <p className="text-xs text-gray-700 mt-1">{a.message}</p>
                      <p className="text-[10px] text-gray-500 mt-1">{formatBR(a.created_at)}</p>
                    </div>
                    {!a.read_at && (
                      <button
                        onClick={() => markRead.mutate(a.id)}
                        className="text-gray-400 hover:text-gray-700"
                        title="Marcar como lido"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
