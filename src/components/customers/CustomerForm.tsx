'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import type { CustomerFormData, Customer } from '@/types';

interface CustomerFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  customer?: Customer | null;
}

export default function CustomerForm({ isOpen, onClose, onSuccess, customer }: CustomerFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const supabase = createClient();
  const isEditing = !!customer;

  const [formData, setFormData] = useState<CustomerFormData>({
    full_name: customer?.full_name ?? '',
    phone: customer?.phone ?? '',
    email: customer?.email ?? '',
    address: customer?.address ?? '',
    customer_type: customer?.customer_type ?? 'individual',
    notes: customer?.notes ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerFormData, string>>>({});
  const [isLoading, setIsLoading] = useState(false);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof CustomerFormData, string>> = {};
    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Full name is required';
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email address';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      if (isEditing) {
        const { error } = await supabase
          .from('customers')
          .update({
            full_name: formData.full_name.trim(),
            phone: formData.phone.trim() || null,
            email: formData.email.trim() || null,
            address: formData.address.trim() || null,
            customer_type: formData.customer_type,
            notes: formData.notes.trim() || null,
          })
          .eq('id', customer.id);

        if (error) throw error;

        // Log activity
        await supabase.from('activities').insert({
          customer_id: customer.id,
          user_id: user?.id,
          action: 'customer_updated',
          description: `Updated customer "${formData.full_name}"`,
        });

        toast('Customer updated successfully', 'success');
      } else {
        const { data, error } = await supabase
          .from('customers')
          .insert({
            full_name: formData.full_name.trim(),
            phone: formData.phone.trim() || null,
            email: formData.email.trim() || null,
            address: formData.address.trim() || null,
            customer_type: formData.customer_type,
            notes: formData.notes.trim() || null,
            created_by: user?.id,
          })
          .select()
          .single();

        if (error) throw error;

        // Log activity
        await supabase.from('activities').insert({
          customer_id: data.id,
          user_id: user?.id,
          action: 'customer_created',
          description: `Created customer "${formData.full_name}"`,
        });

        toast('Customer created successfully', 'success');
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      const message = error?.message || error?.error_description || (error instanceof Error ? error.message : 'Failed to save customer');
      console.error('Customer save error:', error);
      toast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = (field: keyof CustomerFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Customer' : 'Add Customer'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            id="full_name"
            label="Full Name *"
            value={formData.full_name}
            onChange={(e) => updateField('full_name', e.target.value)}
            error={errors.full_name}
            placeholder="Enter full name"
          />
          <Select
            id="customer_type"
            label="Customer Type"
            value={formData.customer_type}
            onChange={(e) => updateField('customer_type', e.target.value)}
            options={[
              { value: 'individual', label: 'Individual' },
              { value: 'business', label: 'Business' },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            id="phone"
            label="Phone"
            value={formData.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            placeholder="Enter phone number"
          />
          <Input
            id="email"
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => updateField('email', e.target.value)}
            error={errors.email}
            placeholder="Enter email address"
          />
        </div>

        <Input
          id="address"
          label="Address"
          value={formData.address}
          onChange={(e) => updateField('address', e.target.value)}
          placeholder="Enter address"
        />

        <Textarea
          id="notes"
          label="Notes"
          value={formData.notes}
          onChange={(e) => updateField('notes', e.target.value)}
          placeholder="Additional notes about this customer"
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            {isEditing ? 'Save Changes' : 'Add Customer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
