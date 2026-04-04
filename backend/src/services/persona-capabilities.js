function resolvePersonaCapabilities(profileRow) {
  const profileKind = String(profileRow?.profile_kind || "consumer");
  const sellerChecklistDone = Boolean(profileRow?.seller_checklist_completed_at);
  const isProfessional = profileKind === "professional";
  const isBusiness = profileKind === "business_interest";
  const canCreateProducts = isProfessional || isBusiness || sellerChecklistDone;
  return {
    profile: profileKind,
    can_access_creator_hub: canCreateProducts,
    can_create_products: canCreateProducts,
    can_connect_payouts: canCreateProducts,
    can_promote_products_in_posts: canCreateProducts,
    can_manage_memberships: isBusiness,
    can_use_affiliate_tools: isBusiness,
    can_use_business_directory_tools: isBusiness
  };
}

module.exports = {
  resolvePersonaCapabilities
};
