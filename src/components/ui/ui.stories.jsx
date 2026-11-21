import EmptyState from "@/components/common/EmptyState";
import FormField from "@/components/FormField";
import Modal from "@/components/Modal";
import Pagination from "@/components/ui/Pagination";
import PrimaryButton from "@/components/ui/PrimaryButton";
import StarRating from "@/components/ui/StarRating";
import TextInput from "@/components/ui/TextInput";

export default { title: "UI/Shared components" };

export const PrimaryButtonStates = {
  render: () => <div className="flex gap-3"><PrimaryButton>Continue</PrimaryButton><PrimaryButton disabled>Disabled</PrimaryButton></div>,
};

export const TextInputAndFormField = {
  render: () => <div className="max-w-md space-y-4"><TextInput label="Wallet address" placeholder="G..." /><FormField label="Email" type="email" placeholder="name@example.com" error="Enter a valid email" /></div>,
};

export const StarRatingDefault = { render: () => <StarRating value={4} /> };
export const PaginationDefault = { render: () => <Pagination page={2} totalPages={5} onPageChange={() => {}} /> };
export const Empty = { render: () => <EmptyState title="No materials found" description="Try another search." /> };
export const Dialog = { render: () => <Modal isOpen title="Preview" onClose={() => {}}>Shared modal content</Modal> };
