"use client";

import { useState } from "react";
import { Plus, UserCog } from "lucide-react";
import { useMeQuery } from "@/store/admin/api";
import { useSaveUserMutation, useUsersQuery } from "@/store/admin/ownerApi";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, Card, Checkbox, EmptyState, ErrorBlock, Input, LoadingBlock, Modal, PageHeader, Select, Table, useToast } from "@/components/admin/ui";

export default function StaffManager() {
  const { data, error, isLoading, refetch } = useUsersQuery();
  const { data: me } = useMeQuery();
  const [editing, setEditing] = useState(null);

  return (
    <>
      <PageHeader
        title="Staff"
        description="Staff can take orders, record sales and manage products and stock. Only owners see costs, profit, expenses and settings."
        actions={
          <Button variant="gold" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Add staff
          </Button>
        }
      />

      {isLoading && <LoadingBlock />}
      {error && <ErrorBlock error={error} onRetry={refetch} />}
      {!isLoading && !error && (
        <Card padded={false}>
          <Table
            rows={data?.data || []}
            onRowClick={setEditing}
            empty={<EmptyState icon={UserCog} title="No accounts" />}
            columns={[
              {
                key: "name",
                label: "Name",
                render: (user) => (
                  <div>
                    <p className="font-medium text-ink-900">
                      {user.name} {user.id === me?.data?.id && <span className="text-xs font-normal text-ink-400">(you)</span>}
                    </p>
                    <p className="text-xs text-ink-400">{user.email}</p>
                  </div>
                ),
              },
              { key: "role", label: "Role", render: (user) => <Badge tone={user.role === "owner" ? "gold" : "neutral"}>{user.role === "owner" ? "Owner" : "Staff"}</Badge> },
              { key: "last_login_at", label: "Last sign-in", className: "hidden sm:table-cell text-ink-500", render: (user) => (user.last_login_at ? formatDateTime(user.last_login_at) : "Never") },
              { key: "is_active", label: "", align: "right", render: (user) => !user.is_active && <Badge tone="red">Disabled</Badge> },
            ]}
          />
        </Card>
      )}

      {editing && <UserModal key={editing === "new" ? "new" : editing.id} user={editing === "new" ? null : editing} isSelf={editing !== "new" && editing.id === me?.data?.id} onClose={() => setEditing(null)} />}
    </>
  );
}

function UserModal({ user, isSelf, onClose }) {
  const [save, { isLoading }] = useSaveUserMutation();
  const { notify } = useToast();
  const [errors, setErrors] = useState({});

  async function submit(event) {
    event.preventDefault();
    setErrors({});
    const form = new FormData(event.currentTarget);
    const payload = {
      name: form.get("name"),
      email: form.get("email"),
      role: form.get("role"),
      ...(form.get("password") ? { password: form.get("password") } : {}),
      ...(user ? { is_active: event.currentTarget.elements.is_active.checked } : {}),
    };

    try {
      await save({ id: user?.id, ...payload }).unwrap();
      notify(user ? "Account updated." : "Staff account created. Share the password with them privately.");
      onClose();
    } catch (error) {
      setErrors(Object.fromEntries(Object.entries(error.errors || { form: [error.message] }).map(([key, messages]) => [key, messages[0]])));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={user ? `Edit ${user.name}` : "Add staff account"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={isLoading}>
            Save
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-4">
        <Input name="name" label="Name" required defaultValue={user?.name} error={errors.name} />
        <Input name="email" label="Email (used to sign in)" type="email" required defaultValue={user?.email} error={errors.email} />
        <Select
          name="role"
          label="Role"
          options={[
            { value: "staff", label: "Staff — orders, sales, products, stock" },
            { value: "owner", label: "Owner — everything incl. profit & settings" },
          ]}
          defaultValue={user?.role || "staff"}
          disabled={isSelf}
        />
        {isSelf && <input type="hidden" name="role" value={user.role} />}
        <Input
          name="password"
          label={user ? "New password (optional)" : "Password"}
          type="password"
          autoComplete="new-password"
          required={!user}
          hint="At least 10 characters with letters and numbers."
          error={errors.password}
        />
        {user && !isSelf && <Checkbox name="is_active" label="Account active" hint="Disabled accounts are signed out immediately." defaultChecked={user.is_active} />}
        {user && isSelf && <input type="checkbox" name="is_active" defaultChecked hidden readOnly />}
        {errors.form && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errors.form}</p>}
      </form>
    </Modal>
  );
}
