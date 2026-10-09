import { canonicalDigest } from "./canonicalDigest.js";
import { factoryDelegationBindingDigest, type FactoryDelegationBinding } from "./factoryDelegationBinding.js";

export type EngineeringTariff = {
  schema: "enterprise-engineering-tariff/v1";
  basis: "DETERMINISTIC_ENGINEERING_ZERO_CHARGE";
  approvedBy: string; approvedAt: number; expiresAt: number;
  baseBindingDigest: string; baseManifestDigest: string; digest: string;
};

export function bindEngineeringTariff(binding: FactoryDelegationBinding, approvedAt: number) {
  const body = { schema: "enterprise-engineering-tariff/v1" as const,
    basis: "DETERMINISTIC_ENGINEERING_ZERO_CHARGE" as const, approvedBy: binding.ownerScope, approvedAt,
    expiresAt: binding.expiresAt, baseBindingDigest: factoryDelegationBindingDigest(binding),
    baseManifestDigest: binding.executionManifestDigest };
  const tariff = { ...body, digest: canonicalDigest("enterprise-engineering-tariff/v1", body) };
  const committed = { ...binding, executionManifestDigest: canonicalDigest("enterprise-tariff-manifest/v1", {
    baseManifestDigest: tariff.baseManifestDigest, tariffDigest: tariff.digest }) };
  verifyEngineeringTariff(committed, tariff, approvedAt);
  return { binding: committed, tariff };
}

export function verifyEngineeringTariff(binding: FactoryDelegationBinding, tariff: EngineeringTariff, admittedAt: number) {
  const { digest, ...body } = tariff;
  if (tariff.schema !== "enterprise-engineering-tariff/v1" || tariff.basis !== "DETERMINISTIC_ENGINEERING_ZERO_CHARGE"
    || tariff.approvedBy !== binding.ownerScope || !Number.isSafeInteger(tariff.approvedAt)
    || !Number.isSafeInteger(admittedAt) || tariff.approvedAt < binding.issuedAt || tariff.approvedAt > admittedAt || tariff.expiresAt <= admittedAt
    || tariff.expiresAt !== binding.expiresAt || digest !== canonicalDigest("enterprise-engineering-tariff/v1", body)
    || tariff.baseBindingDigest !== factoryDelegationBindingDigest({ ...binding, executionManifestDigest: tariff.baseManifestDigest })
    || binding.executionManifestDigest !== canonicalDigest("enterprise-tariff-manifest/v1", {
      baseManifestDigest: tariff.baseManifestDigest, tariffDigest: digest })) throw Error("ENGINEERING_TARIFF_NOT_BOUND");
  return tariff;
}
