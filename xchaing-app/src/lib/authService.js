import { supabase } from '../supabaseClient';

// 1. ???????????? ??????????? Email/Password-??
export async function signUpUser(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName }
    }
  });
  if (error) throw error;
  return data;
}

// 2. ???????????? ??????
export async function signInUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data;
}

// 3. ?????????? ????????
export async function signOutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// 4. ????????? ???????????? ???????????? ??????
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// 5. ??????? ????????/????????????? ????????
export async function getItems() {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) console.error("Error fetching items:", error);
  return data || [];
}

// 6. ?????? ????? ?????? ????????
export async function createItem(itemData) {
  const { data, error } = await supabase
    .from('items')
    .insert([itemData])
    .select();
  if (error) throw error;
  return data;
}

// 7. მომხმარებლის პროფილის მონაცემების მიღება
export async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) console.error("Error fetching profile:", error);
  return data;
}

// 8. პროფილის განახლება
export async function updateUserProfile(userId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
