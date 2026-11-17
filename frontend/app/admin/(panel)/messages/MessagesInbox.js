"use client";

import { Mail, MessageCircle, Phone } from "lucide-react";
import { useMarkMessageReadMutation, useMessagesQuery } from "@/store/admin/contentApi";
import { useUrlFilters } from "@/components/admin/useUrlFilters";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, Card, Checkbox, cx, EmptyState, ErrorBlock, LoadingBlock, PageHeader, Pagination } from "@/components/admin/ui";

const FILTER_KEYS = ["unread", "page"];

export default function MessagesInbox() {
  const [filters, setFilters] = useUrlFilters(FILTER_KEYS);
  const { data, error, isLoading, isFetching, refetch } = useMessagesQuery(filters);
  const [markRead] = useMarkMessageReadMutation();
  const messages = data?.data || [];

  return (
    <>
      <PageHeader title="Messages" description="Questions sent from the Contact page." actions={<Checkbox label="Unread only" checked={filters.unread === "1"} onChange={(event) => setFilters({ unread: event.target.checked ? "1" : "" })} />} />

      {isLoading && <LoadingBlock />}
      {error && <ErrorBlock error={error} onRetry={refetch} />}

      {!isLoading && !error && (
        <Card padded={false} className={cx("transition-opacity", isFetching && "opacity-60")}>
          {messages.length === 0 ? (
            <EmptyState icon={Mail} title="No messages" description="Messages from the website contact form appear here." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {messages.map((message) => (
                <li key={message.id} className={cx("flex flex-col gap-3 p-5 sm:flex-row sm:justify-between", !message.is_read && "bg-gold-300/10")}>
                  <div className="min-w-0 space-y-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-ink-900">
                      {message.name} {!message.is_read && <Badge tone="gold">New</Badge>}
                    </p>
                    <p className="text-sm whitespace-pre-line text-ink-700">{message.message}</p>
                    <p className="text-xs text-ink-400">{formatDateTime(message.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-start gap-1">
                    {message.phone && (
                      <>
                        <a href={`tel:${message.phone}`}>
                          <Button size="sm" variant="secondary">
                            <Phone className="size-3.5" /> {message.phone}
                          </Button>
                        </a>
                        <a href={`https://wa.me/88${message.phone}`} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="secondary" aria-label="WhatsApp">
                            <MessageCircle className="size-3.5" />
                          </Button>
                        </a>
                      </>
                    )}
                    {message.email && (
                      <a href={`mailto:${message.email}`}>
                        <Button size="sm" variant="secondary">
                          <Mail className="size-3.5" /> Email
                        </Button>
                      </a>
                    )}
                    {!message.is_read && (
                      <Button size="sm" variant="ghost" onClick={() => markRead(message.id)}>
                        Mark read
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Pagination meta={data?.meta} onPageChange={(page) => setFilters({ page })} />
        </Card>
      )}
    </>
  );
}
