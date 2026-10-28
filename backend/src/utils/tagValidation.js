/**
 * Validation and normalization utilities for Hierarchical Topic Tags (FR-10).
 */

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SLUG_REGEX = /^[a-z0-9]+(_[a-z0-9]+)*$/;

/**
 * Validates a standard UUID string.
 */
export const isValidUUID = (value) => {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
};

/**
 * Derives a normalized snake_case slug from a tag name.
 * e.g., "Solar Panels" -> "solar_panels", "Perovskite-Cells" -> "perovskite_cells"
 */
export const generateSlug = (name) => {
  if (typeof name !== 'string') return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

/**
 * Validates human-readable tag name.
 */
export const validateTagName = (name) => {
  if (name === undefined || name === null) {
    return { valid: false, error: 'Tag name is required.' };
  }
  if (typeof name !== 'string') {
    return { valid: false, error: 'Tag name must be a string.' };
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Tag name cannot be empty or whitespace only.' };
  }
  if (trimmed.length > 100) {
    return { valid: false, error: 'Tag name cannot exceed 100 characters.' };
  }

  return { valid: true, sanitized: trimmed };
};

/**
 * Validates slug format.
 */
export const validateTagSlug = (slug) => {
  if (slug === undefined || slug === null) {
    return { valid: false, error: 'Tag slug is required.' };
  }
  if (typeof slug !== 'string') {
    return { valid: false, error: 'Tag slug must be a string.' };
  }

  const normalized = slug.trim().toLowerCase();
  if (normalized.length === 0) {
    return { valid: false, error: 'Tag slug cannot be empty.' };
  }
  if (normalized.length > 100) {
    return { valid: false, error: 'Tag slug cannot exceed 100 characters.' };
  }
  if (!SLUG_REGEX.test(normalized)) {
    return {
      valid: false,
      error:
        'Tag slug must consist of lowercase alphanumeric characters separated by single underscores (no leading, trailing, or consecutive underscores).',
    };
  }

  return { valid: true, sanitized: normalized };
};

/**
 * Validates payload for creating a tag.
 */
export const validateCreateTagPayload = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Request body must be a valid JSON object.' };
  }

  const { name, slug, parentId, parent_id, description } = body;

  const nameResult = validateTagName(name);
  if (!nameResult.valid) return nameResult;

  let finalSlug;
  if (slug !== undefined && slug !== null) {
    const slugResult = validateTagSlug(slug);
    if (!slugResult.valid) return slugResult;
    finalSlug = slugResult.sanitized;
  } else {
    finalSlug = generateSlug(nameResult.sanitized);
    const slugResult = validateTagSlug(finalSlug);
    if (!slugResult.valid) {
      return {
        valid: false,
        error:
          'Could not automatically generate a valid slug from name. Please provide an explicit slug.',
      };
    }
  }

  const effectiveParentId = parent_id !== undefined ? parent_id : parentId;
  let finalParentId = null;
  if (effectiveParentId !== undefined && effectiveParentId !== null && effectiveParentId !== '') {
    if (!isValidUUID(effectiveParentId)) {
      return { valid: false, error: 'parentId must be a valid UUID or null.' };
    }
    finalParentId = effectiveParentId.trim();
  }

  let finalDescription = null;
  if (description !== undefined && description !== null) {
    if (typeof description !== 'string') {
      return { valid: false, error: 'Description must be a string.' };
    }
    finalDescription = description.trim() || null;
  }

  return {
    valid: true,
    sanitized: {
      name: nameResult.sanitized,
      slug: finalSlug,
      parentId: finalParentId,
      description: finalDescription,
    },
  };
};

/**
 * Validates payload for updating a tag.
 */
export const validateUpdateTagPayload = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Request body must be a valid JSON object.' };
  }

  const allowedFields = ['name', 'slug', 'parentId', 'parent_id', 'description'];
  const suppliedFields = allowedFields.filter((field) => body[field] !== undefined);

  if (suppliedFields.length === 0) {
    return { valid: false, error: 'Provide at least one field to update.' };
  }

  const sanitized = {};

  if (body.name !== undefined) {
    const nameResult = validateTagName(body.name);
    if (!nameResult.valid) return nameResult;
    sanitized.name = nameResult.sanitized;
  }

  if (body.slug !== undefined) {
    const slugResult = validateTagSlug(body.slug);
    if (!slugResult.valid) return slugResult;
    sanitized.slug = slugResult.sanitized;
  }

  const effectiveParentId =
    body.parent_id !== undefined ? body.parent_id : body.parentId;

  if (effectiveParentId !== undefined) {
    if (effectiveParentId === null || effectiveParentId === '') {
      sanitized.parentId = null;
    } else {
      if (!isValidUUID(effectiveParentId)) {
        return { valid: false, error: 'parentId must be a valid UUID or null.' };
      }
      sanitized.parentId = effectiveParentId.trim();
    }
  }

  if (body.description !== undefined) {
    if (body.description === null) {
      sanitized.description = null;
    } else if (typeof body.description !== 'string') {
      return { valid: false, error: 'Description must be a string.' };
    } else {
      sanitized.description = body.description.trim() || null;
    }
  }

  return { valid: true, sanitized };
};
