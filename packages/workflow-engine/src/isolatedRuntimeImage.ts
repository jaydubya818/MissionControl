/** An OCI archive's independently verified manifest/config mapping. The registered
 * harness supplies this binding; an invocation cannot choose a Docker alias. */
export interface IsolatedRuntimeImageBinding {
  manifestDigest: string;
  configDigest: string;
  sourceSha: string;
  os: "linux";
  architecture: "amd64";
}

export interface IsolatedRuntimeImageEvidence extends IsolatedRuntimeImageBinding {
  selectedReference: string;
  observedImageId: string;
  descriptorDigest: string | null;
  descriptorConfigDigest: string | null;
}

export function assertIsolatedRuntimeImageBinding(binding: IsolatedRuntimeImageBinding, runtimeImage: string): void {
  if (!binding || Object.keys(binding).sort().join(",") !== "architecture,configDigest,manifestDigest,os,sourceSha"
    || !/^sha256:[a-f0-9]{64}$/.test(binding.manifestDigest)
    || !/^sha256:[a-f0-9]{64}$/.test(binding.configDigest)
    || binding.manifestDigest === binding.configDigest || binding.manifestDigest !== runtimeImage
    || !/^[a-f0-9]{40}$/.test(binding.sourceSha) || binding.os !== "linux" || binding.architecture !== "amd64") {
    throw new Error("Invalid exact runtime image binding");
  }
}

/** Docker's containerd store addresses the manifest; the classic store addresses
 * the config. Both must resolve to the mapping verified from the SAME OCI archive.
 * A present but contradictory image is an error, never permission to try another. */
export function inspectIsolatedRuntimeImage(binding: IsolatedRuntimeImageBinding, reference: string,
  inspection: unknown): IsolatedRuntimeImageEvidence {
  assertIsolatedRuntimeImageBinding(binding, binding.manifestDigest);
  const rows = inspection as any;
  const image = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  const descriptor = image?.Descriptor;
  const descriptorDigest = descriptor?.digest ?? null;
  const descriptorConfigDigest = descriptor?.annotations?.["config.digest"] ?? null;
  if (![binding.manifestDigest, binding.configDigest].includes(reference) || image?.Id !== reference
    || image?.Os !== binding.os || image?.Architecture !== binding.architecture
    || image?.Config?.Labels?.["org.opencontainers.image.revision"] !== binding.sourceSha
    || (descriptor && (descriptorDigest !== binding.manifestDigest || descriptorConfigDigest !== binding.configDigest))
    || (reference === binding.manifestDigest && !descriptor)) {
    throw new Error("Docker image contradicts the qualified OCI artifact");
  }
  return { ...binding, selectedReference: reference, observedImageId: image.Id, descriptorDigest, descriptorConfigDigest };
}

export function isolatedRuntimeImageEvidenceMatches(evidence: unknown, binding: IsolatedRuntimeImageBinding): boolean {
  const value = evidence as IsolatedRuntimeImageEvidence;
  if (!value || Object.keys(value).sort().join(",") !== "architecture,configDigest,descriptorConfigDigest,descriptorDigest,manifestDigest,observedImageId,os,selectedReference,sourceSha") return false;
  if (Object.entries(binding).some(([key, expected]) => value[key as keyof IsolatedRuntimeImageEvidence] !== expected)) return false;
  try {
    const expected = inspectIsolatedRuntimeImage(binding, value.selectedReference, [{ Id: value.observedImageId,
      Os: value.os, Architecture: value.architecture, Config: { Labels: { "org.opencontainers.image.revision": value.sourceSha } },
      ...(value.descriptorDigest === null && value.descriptorConfigDigest === null ? {} : {
        Descriptor: { digest: value.descriptorDigest, annotations: { "config.digest": value.descriptorConfigDigest } },
      }),
    }]);
    return Object.entries(expected).every(([key, item]) => value[key as keyof IsolatedRuntimeImageEvidence] === item);
  } catch { return false; }
}
