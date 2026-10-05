'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import type { Building, BuildingFormData } from '@/types';

interface BuildingFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  building?: Building | null;
}

export default function BuildingForm({
  isOpen,
  onClose,
  onSuccess,
  building,
}: BuildingFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const supabase = createClient();
  const isEditing = !!building;

  const [formData, setFormData] = useState<BuildingFormData>({
    name: building?.name ?? '',
    code: building?.code ?? '',
    address: building?.address ?? '',
    description: building?.description ?? '',
    is_active: building?.is_active ?? true,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof BuildingFormData, string>>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: building?.name ?? '',
        code: building?.code ?? '',
        address: building?.address ?? '',
        description: building?.description ?? '',
        is_active: building?.is_active ?? true,
      });
      setErrors({});
    }
  }, [isOpen, building]);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof BuildingFormData, string>> = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Building / Project name is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      const payload = {
        name: formData.name.trim(),
        code: formData.code.trim() || null,
        address: formData.address.trim() || null,
        description: formData.description.trim() || null,
        is_active: formData.is_active,
      };

      if (isEditing && building) {
        const { error } = await supabase
          .from('buildings')
          .update(payload)
          .eq('id', building.id);

        if (error) throw error;
        toast('Building updated successfully', 'success');
      } else {
        const { error } = await supabase
          .from('buildings')
          .insert({
            ...payload,
            created_by: user?.id,
          });

        if (error) throw error;
        toast('Building created successfully', 'success');
      }

      onSuccess();
      onClose();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save building';
      toast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = <K extends keyof BuildingFormData>(field: K, value: BuildingFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Building / Project' : 'New Building / Project'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="building_name"
          label="Building / Project Name *"
          placeholder="e.g. Skyline Towers, Green Valley Heights"
          value={formData.name}
          onChange={(e) => updateField('name', e.target.value)}
          error={errors.name}
          autoFocus
        />

        <Input
          id="building_code"
          label="Code / Reference ID"
          placeholder="e.g. BLD-001, PRJ-101"
          value={formData.code}
          onChange={(e) => updateField('code', e.target.value)}
        />

        <Input
          id="building_address"
          label="Address / Location"
          placeholder="e.g. 124 Outer Ring Rd, Bangalore"
          value={formData.address}
          onChange={(e) => updateField('address', e.target.value)}
        />

        <Textarea
          id="building_description"
          label="Description / Project Notes"
          placeholder="Residential tower with 48 units, home loan tie-up..."
          value={formData.description}
          onChange={(e) => updateField('description', e.target.value)}
          rows={3}
        />

        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="building_is_active"
            checked={formData.is_active}
            onChange={(e) => updateField('is_active', e.target.checked)}
            className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="building_is_active" className="text-sm font-medium text-slate-300">
            Active building / project (available for case assignment)
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
          <Button variant="secondary" type="button" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            {isEditing ? 'Save Changes' : 'Create Building'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
