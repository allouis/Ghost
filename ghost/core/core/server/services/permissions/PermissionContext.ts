/**
 * Permission Context Class
 *
 * A clean, typed interface for passing permission-related context to
 * permissibleV2 methods. This replaces the 8-parameter signature of
 * the old permissible methods with a single context object.
 *
 * Part of the permissions system refactor (Phase 1, Step 1.2).
 */

// Staff roles that have access to the admin panel
const STAFF_ROLES = ['Owner', 'Administrator', 'Super Editor', 'Editor', 'Author', 'Contributor'];

interface PermissionContextOptions {
    role: string;
    actorId: string | null;
    isViaApiKey?: boolean;
    unsafeAttrs?: Record<string, unknown>;
}

interface RequestContext {
    user?: string;
    api_key?: {
        id: string;
        type: string;
    };
    member?: {
        id: string;
    };
}

/**
 * PermissionContext encapsulates all the information needed for permission
 * checks in a clean, single object.
 *
 * Properties:
 * - role: The resolved role name (e.g., 'Owner', 'Administrator', 'Member')
 * - actorId: The user ID or member ID (null for pure API key requests)
 * - isViaApiKey: True if the request came through ANY API key
 * - unsafeAttrs: The attributes being modified in the request
 *
 * The role is already resolved before this context is created. The permissible
 * method doesn't need to know HOW we determined the role (user lookup, API key
 * lookup, etc.) - it just needs the role and context for making decisions.
 */
export class PermissionContext {
    role: string;
    actorId: string | null;
    isViaApiKey: boolean;
    unsafeAttrs: Record<string, unknown>;

    /**
     * Create a new PermissionContext.
     */
    constructor({role, actorId, isViaApiKey = false, unsafeAttrs = {}}: PermissionContextOptions) {
        this.role = role;
        this.actorId = actorId;
        this.isViaApiKey = isViaApiKey;
        this.unsafeAttrs = unsafeAttrs;
    }

    /**
     * Check if the given ID matches the actor's ID.
     * Used for ownership checks (e.g., "can user edit their own profile").
     */
    isActorId(id: string | null): boolean {
        if (this.actorId === null || id === null) {
            return false;
        }
        return this.actorId === id;
    }

    /**
     * Check if the actor is a staff user (has admin panel access).
     */
    isStaff(): boolean {
        return STAFF_ROLES.includes(this.role);
    }

    /**
     * Create a PermissionContext from a request context object.
     *
     * The request context typically comes from the API layer and contains:
     * - user: User ID for authenticated staff users
     * - api_key: API key object for API key authenticated requests
     * - member: Member object for member-authenticated requests
     */
    static fromRequestContext(requestContext: RequestContext, role: string, unsafeAttrs: Record<string, unknown> = {}): PermissionContext {
        let actorId: string | null = null;
        let isViaApiKey = false;

        // Determine actor ID and API key status
        if (requestContext.user) {
            // Staff user - user ID is the actor
            actorId = requestContext.user;
        } else if (requestContext.member && requestContext.member.id) {
            // Member - member ID is the actor
            actorId = requestContext.member.id;
        }
        // For pure API key requests, actorId stays null

        // Check if request came through API key
        if (requestContext.api_key) {
            isViaApiKey = true;
        }

        return new PermissionContext({
            role,
            actorId,
            isViaApiKey,
            unsafeAttrs
        });
    }
}
