
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { doc, updateDoc, increment } from 'firebase/firestore';

export const useAccessControl = () => {
  const { currentUser } = useAuth();

  const checkAccess = async (
    featureName: string, 
    options: { decrement?: boolean; subscriptionOnly?: boolean } = {}
  ): Promise<{ allowed: boolean; reason?: 'subscription' | 'trial_ended' | 'banned' }> => {
    const { decrement = true, subscriptionOnly = false } = options;

    if (!currentUser) {
      console.log(`[AccessControl] No user found for feature: ${featureName}`);
      return { allowed: false, reason: 'subscription' };
    }
    
    // Check if user is banned
    if (currentUser.status === 'banned') {
      console.log(`[AccessControl] User ${currentUser.id} is banned. Access denied for: ${featureName}`);
      return { allowed: false, reason: 'banned' };
    }

    // Admin and Moderator have full access
    if (currentUser.role === 'admin' || currentUser.role === 'moderator') {
      console.log(`[AccessControl] User ${currentUser.id} is ${currentUser.role}. Access granted for: ${featureName}`);
      return { allowed: true };
    }

    // Check subscription
    const now = new Date();
    const expiry = currentUser.subscriptionExpiry?.toDate?.() || 
                 (currentUser.subscriptionExpiry instanceof Date ? currentUser.subscriptionExpiry : null);
    
    const isSubscribed = expiry && expiry > now;

    if (isSubscribed) {
      console.log(`[AccessControl] User ${currentUser.id} has active subscription. Access granted for: ${featureName}`);
      return { allowed: true };
    }

    // If subscription is required and user is not subscribed, deny even if they have free attempts
    if (subscriptionOnly) {
      console.log(`[AccessControl] Feature ${featureName} requires active subscription. User ${currentUser.id} is not subscribed.`);
      return { allowed: false, reason: 'subscription' };
    }

    // Check free attempts
    const freeAttempts = Number(currentUser.freeAttempts || 0);
    if (freeAttempts > 0) {
      // Decrement free attempts if requested
      if (decrement) {
        try {
          console.log(`[AccessControl] User ${currentUser.id} using free attempt for: ${featureName}. Remaining: ${freeAttempts - 1}`);
          await updateDoc(doc(db, 'users', currentUser.id), {
            freeAttempts: increment(-1)
          });
        } catch (err) {
          console.error("Error updating free attempts:", err);
          return { allowed: false, reason: 'trial_ended' };
        }
      } else {
        console.log(`[AccessControl] User ${currentUser.id} has free attempts but decrement skipped for: ${featureName}`);
      }
      return { allowed: true };
    }

    console.log(`[AccessControl] User ${currentUser.id} has no access for: ${featureName}. Attempts: ${freeAttempts}`);
    return { allowed: false, reason: 'subscription' };
  };

  return { checkAccess };
};
