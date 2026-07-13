import { createFileRoute } from '@tanstack/react-router'

/**
 * Pedidos não pagos permanecem como PENDING no painel admin.
 * Este endpoint foi mantido apenas para compatibilidade com cron jobs antigos
 * mas não altera mais o status dos pedidos.
 */
export const Route = createFileRoute('/api/public/hooks/expire-pix')({
  server: {
    handlers: {
      POST: async () => {
        return new Response(
          JSON.stringify({ success: true, expired: 0, disabled: true }),
          { headers: { 'Content-Type': 'application/json' } },
        )
      },
    },
  },
})
