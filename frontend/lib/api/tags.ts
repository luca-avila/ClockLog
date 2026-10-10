// ClockLog — a Pomodoro timer and weekly planner
// Copyright (C) 2024  Luca
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { api, unwrap, type Schemas } from "./client";

export type Tag = Schemas["TagResponse"];
export type TagCreate = Schemas["TagCreate"];
export type TagUpdate = Schemas["TagUpdate"];

export async function fetchTags(): Promise<Tag[]> {
  return unwrap(api.GET("/tags"));
}

export async function createTag(data: TagCreate): Promise<Tag> {
  return unwrap(api.POST("/tags", { body: data }));
}

export async function updateTag(id: string, data: TagUpdate): Promise<Tag> {
  return unwrap(api.PATCH("/tags/{tag_id}", { params: { path: { tag_id: id } }, body: data }));
}

export async function deleteTag(id: string): Promise<Schemas["TagDeleteResponse"]> {
  return unwrap(api.DELETE("/tags/{tag_id}", { params: { path: { tag_id: id } } }));
}
